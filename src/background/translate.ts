/**
 * Translation orchestrator: cache -> rate limit -> provider -> fallback.
 *
 * Lives in the background page because a fetch from a content script would hit the page's
 * CSP and CORS rules, which differ from site to site.
 */
import { cacheKey, getCached, putCached } from '../lib/cache'
import { describeWait, recordRefusal, recordSuccess, remainingSeconds } from './cooldown'
import { createGoogleCloud } from '../lib/providers/google-cloud'
import { bing } from '../lib/providers/bing'
import { googleGtx } from '../lib/providers/google-gtx'
import { myMemory } from '../lib/providers/mymemory'
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
 * Who gets asked, in order.
 *
 * A user key is the stable, sanctioned path, so it goes first when there is one. Then the
 * keyless three in descending order of both quality and reliability: Google, Bing, MyMemory.
 * Bing is the most fragile of them — its credentials are read off a live web page — so it sits
 * behind Google, but its translations are far better than the last resort's.
 */
function providerChain(apiKey: string): TranslationProvider[] {
  const free = [googleGtx, bing, myMemory]
  return apiKey.trim() === '' ? free : [createGoogleCloud(apiKey.trim()), ...free]
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

  let lastError = new ProviderError('provider-failed', 'no provider available')
  /** Shortest wait among the providers we skipped, for an honest message at the end. */
  let shortestWait = Number.POSITIVE_INFINITY

  for (const provider of providerChain(settings.apiKey)) {
    // Checked per provider: one sulking endpoint must not silence the others.
    const waiting = await remainingSeconds(provider.id)
    if (waiting > 0) {
      shortestWait = Math.min(shortestWait, waiting)
      continue
    }

    try {
      const result = await callWithRetry(provider, resolved)
      await putCached(key, result)
      await recordSuccess(provider.id)
      return withLanguages(result, from, to)
    } catch (error) {
      lastError = asProviderError(error)

      // A malformed request fails identically everywhere; trying the next provider is pointless.
      if (lastError.code === 'bad-request' && provider.id !== 'mymemory') throw lastError

      // A refusal or a broken provider earns a rest. A dropped connection does not: that is
      // the reader's network, and blaming every provider for it would leave them with none.
      if (lastError.code === 'rate-limited' || lastError.code === 'provider-failed') {
        shortestWait = Math.min(shortestWait, await recordRefusal(provider.id))
      }
    }
  }

  if (Number.isFinite(shortestWait)) {
    throw new ProviderError(
      'rate-limited',
      `Translation services are refusing requests. Try again in ${describeWait(shortestWait)}.`,
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
