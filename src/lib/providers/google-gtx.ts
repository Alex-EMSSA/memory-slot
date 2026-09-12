/**
 * Google's unofficial `translate_a/single` endpoint — the one every browser translation
 * extension uses. No key, no quota, no documentation, and no promise it will keep working.
 *
 * The response is a bare nested array whose shape Google changes without notice, so parsing
 * lives in one exported function covered by fixture tests: when it breaks, one file is wrong.
 */
import { ProviderError, type TranslateRequest, type TranslateResult } from './types'

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

/** Maximum dictionary senses kept for a single word; more than this is noise on a flashcard. */
const MAX_ALTERNATIVES = 8

function buildUrl({ text, from, to }: TranslateRequest): string {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: from,
    tl: to,
    hl: to,
    ie: 'UTF-8',
    oe: 'UTF-8',
    q: text,
  })
  // dt=t returns the translated sentence chunks, dt=bd the dictionary entries.
  params.append('dt', 't')
  params.append('dt', 'bd')
  return `${ENDPOINT}?${params.toString()}`
}

/**
 * Shape as of 2026-09:
 *   [ [["привіт","hello",...], ...], [dictionary]|null, "en", ... ]
 * Long input is split across several chunks in slot 0, which must be concatenated in order.
 */
export function parseGtxResponse(raw: unknown): TranslateResult {
  if (!Array.isArray(raw)) {
    throw new ProviderError('provider-failed', 'gtx: response is not an array')
  }

  const chunks: unknown = raw[0]
  if (!Array.isArray(chunks)) {
    throw new ProviderError('provider-failed', 'gtx: no translation section')
  }

  let text = ''
  for (const chunk of chunks) {
    if (Array.isArray(chunk) && typeof chunk[0] === 'string') text += chunk[0]
  }
  if (text.trim() === '') {
    throw new ProviderError('provider-failed', 'gtx: empty translation')
  }

  const detectedFrom = typeof raw[2] === 'string' && raw[2] !== '' ? raw[2] : undefined
  const alternatives = parseDictionary(raw[1])

  return {
    text,
    ...(detectedFrom ? { detectedFrom } : {}),
    ...(alternatives.length > 0 ? { alternatives } : {}),
  }
}

/** Dictionary entries look like [partOfSpeech, ["sense", "sense"], ...]. */
function parseDictionary(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []

  const senses: string[] = []
  for (const entry of raw) {
    const words: unknown = Array.isArray(entry) ? entry[1] : undefined
    if (!Array.isArray(words)) continue
    for (const word of words) {
      if (typeof word === 'string' && word !== '') senses.push(word)
    }
  }
  return [...new Set(senses)].slice(0, MAX_ALTERNATIVES)
}

export const googleGtx = {
  id: 'google-gtx',

  async translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResult> {
    let response: Response
    try {
      response = await fetch(buildUrl(request), {
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        ...(signal ? { signal } : {}),
      })
    } catch (cause) {
      throw new ProviderError('network', 'gtx: request failed', cause)
    }

    // 403 is how this endpoint says "you are calling me too much", same as 429.
    if (response.status === 429 || response.status === 403) {
      throw new ProviderError('rate-limited', `gtx: HTTP ${response.status}`)
    }
    if (!response.ok) {
      throw new ProviderError('provider-failed', `gtx: HTTP ${response.status}`)
    }

    let raw: unknown
    try {
      raw = await response.json()
    } catch (cause) {
      throw new ProviderError('provider-failed', 'gtx: response is not JSON', cause)
    }

    return parseGtxResponse(raw)
  },
}
