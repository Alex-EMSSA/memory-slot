/**
 * Translation orchestrator: cache -> rate limit -> provider -> fallback.
 *
 * Lives in the background page because a fetch from a content script would hit the page's
 * CSP and CORS rules, which differ from site to site.
 */
import { cacheKey, getCached, putCached } from '../lib/cache'
import { describeWait, recordRefusal, recordSuccess, remainingSeconds } from './cooldown'
import { createGoogleCloud } from '../lib/providers/google-cloud'
import { googleGtx } from '../lib/providers/google-gtx'
import {
  asProviderError,
  ProviderError,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
} from '../lib/providers/types'
import { MAX_TRANSLATION_LENGTH } from '../lib/limits'
import { RateLimiter } from '../lib/rate-limit'
import { getSettings } from '../lib/store/settings'

const NETWORK_RETRY_DELAYS_MS = [400, 1200]

const limiter = new RateLimiter(300, 60, 60_000)

/**
 * What the caller gets back: the provider's result plus the language pair actually used.
 * The tooltip shows it, and a saved card needs it long after the settings have changed.
 */
export type TranslationOutcome = TranslateResult & { from: string; to: string }

export function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * A user key is the stable, sanctioned path, so it goes first when present. gtx stays behind
 * it as a fallback: keys get revoked, run out of quota and get typo'd.
 */
async function providerChain(apiKey: string): Promise<TranslationProvider[]> {
  return apiKey.trim() === '' ? [googleGtx] : [createGoogleCloud(apiKey.trim()), googleGtx]
}

export async function translate(
  request: Partial<TranslateRequest>,
): Promise<TranslationOutcome> {
  const settings = await getSettings()

  const text = normalize(request.text ?? '')
  const from = request.from ?? settings.sourceLang
  const to = request.to ?? settings.targetLang

  if (text === '') throw new ProviderError('bad-request', 'nothing to translate')
  if (text.length > MAX_TRANSLATION_LENGTH) {
    throw new ProviderError('bad-request', `text longer than ${MAX_TRANSLATION_LENGTH} characters`)
  }
  if (!to) throw new ProviderError('bad-request', 'no target language')

  const resolved: TranslateRequest = { text, from, to }
  const key = cacheKey(resolved)

  const cached = await getCached(key)
  if (cached) return withLanguages(cached, from, to)

  // Checked after the cache: a known word must keep working while we are in the doghouse.
  const waiting = await remainingSeconds()
  if (waiting > 0) {
    throw new ProviderError(
      'rate-limited',
      `Google is refusing requests. Try again in ${describeWait(waiting)}.`,
    )
  }

  const providers = await providerChain(settings.apiKey)
  let lastError = new ProviderError('provider-failed', 'no provider available')

  for (const provider of providers) {
    try {
      const result = await callWithRetry(provider, resolved)
      await putCached(key, result)
      await recordSuccess()
      return withLanguages(result, from, to)
    } catch (error) {
      lastError = asProviderError(error)
      // A malformed request fails identically everywhere; trying the next provider is pointless.
      if (lastError.code === 'bad-request') throw lastError
    }
  }

  // Every provider refused. Stop asking for a while: each further request both fails and
  // keeps the block alive.
  if (lastError.code === 'rate-limited') {
    const wait = await recordRefusal()
    throw new ProviderError(
      'rate-limited',
      `Google is refusing requests. Try again in ${describeWait(wait)}.`,
      lastError,
    )
  }

  throw lastError
}

/** The detected language wins over 'auto': the card must record what was really translated. */
function withLanguages(result: TranslateResult, from: string, to: string): TranslationOutcome {
  return { ...result, from: result.detectedFrom ?? from, to }
}

/**
 * Retries only genuine network failures. A 429 is deliberately not retried: when Google is
 * already refusing traffic, retrying is how a throttle turns into a block.
 */
async function callWithRetry(
  provider: TranslationProvider,
  request: TranslateRequest,
): Promise<TranslateResult> {
  let attempt = 0

  for (;;) {
    try {
      await limiter.acquire()
      return await provider.translate(request)
    } catch (error) {
      const failure = asProviderError(error)
      const delay = NETWORK_RETRY_DELAYS_MS[attempt]
      if (failure.code !== 'network' || delay === undefined) throw failure
      attempt += 1
      await sleep(delay)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
