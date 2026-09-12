/**
 * MyMemory: a public translation API with no key and a daily character allowance.
 *
 * Kept as the stand-in for when Google refuses us. Quality varies — it is a translation
 * memory with machine translation behind it, so a common phrase can come back better than
 * Google and an unusual one worse.
 *
 * Unlike Google it will not detect the source language, so an 'auto' request is resolved
 * first with the browser's own detector, which costs no network request and no permission.
 */
import { decodeEntities } from './entities'
import {
  ProviderError,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
} from './types'

const ENDPOINT = 'https://api.mymemory.translated.net/get'

/** What the API says when the day's free allowance is gone. */
const QUOTA_MARKERS = ['MYMEMORY WARNING', 'QUOTA', 'ALL AVAILABLE FREE TRANSLATIONS']

export async function detectLanguage(text: string): Promise<string> {
  try {
    const result = await browser.i18n.detectLanguage(text)
    const best = result.languages[0]
    if (best?.language && best.language !== 'und') return best.language
  } catch {
    // The detector is unavailable in some contexts; English is the likeliest guess.
  }
  return 'en'
}

/**
 * Shape as of 2026-09:
 *   { responseData: { translatedText }, responseStatus: 200, matches: [...] }
 * A refusal arrives as a 200 with the complaint inside translatedText, which is why the
 * body is inspected rather than just the status code.
 */
export function parseMyMemoryResponse(raw: unknown): TranslateResult {
  const body = raw as {
    responseData?: { translatedText?: unknown }
    responseStatus?: unknown
    responseDetails?: unknown
  } | null

  const status = Number(body?.responseStatus)
  const text = body?.responseData?.translatedText

  if (typeof text !== 'string' || text.trim() === '') {
    throw new ProviderError('provider-failed', 'mymemory: no translated text')
  }

  const shouted = text.toUpperCase()
  if (QUOTA_MARKERS.some((marker) => shouted.includes(marker))) {
    throw new ProviderError('rate-limited', 'mymemory: daily allowance used up')
  }

  if (Number.isFinite(status) && status !== 200) {
    const detail = typeof body?.responseDetails === 'string' ? body.responseDetails : status
    throw new ProviderError('provider-failed', `mymemory: ${detail}`)
  }

  return { text: decodeEntities(text) }
}

export const myMemory: TranslationProvider = {
  id: 'mymemory',

  async translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResult> {
    const from = request.from === 'auto' ? await detectLanguage(request.text) : request.from

    if (from === request.to) {
      throw new ProviderError('bad-request', 'mymemory: source and target are the same language')
    }

    const params = new URLSearchParams({ q: request.text, langpair: `${from}|${request.to}` })

    let response: Response
    try {
      response = await fetch(`${ENDPOINT}?${params.toString()}`, {
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        ...(signal ? { signal } : {}),
      })
    } catch (cause) {
      throw new ProviderError('network', 'mymemory: request failed', cause)
    }

    if (response.status === 429) {
      throw new ProviderError('rate-limited', 'mymemory: HTTP 429')
    }
    if (!response.ok) {
      throw new ProviderError('provider-failed', `mymemory: HTTP ${response.status}`)
    }

    let raw: unknown
    try {
      raw = await response.json()
    } catch (cause) {
      throw new ProviderError('provider-failed', 'mymemory: response is not JSON', cause)
    }

    const result = parseMyMemoryResponse(raw)
    return { ...result, detectedFrom: from }
  },
}
