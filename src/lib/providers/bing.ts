/**
 * Bing's web translator, the one behind bing.com/translator.
 *
 * Microsoft's sanctioned API is Azure Translator and needs a key and a card, so this goes the
 * same way every keyless translator does: read the short-lived credentials out of the
 * translator page, then post to the endpoint the page itself uses.
 *
 * That makes it the most fragile provider we have — we are parsing a live web page, not a
 * documented response — so the reading is isolated in one tested function, and a failure here
 * only moves the request to the next provider.
 *
 * No headers are set beyond the content type, and that is deliberate: Bing answers 401 to
 * anything that does not look like a browser, and inside the extension Firefox already sends
 * its own User-Agent. Measured, not assumed — a bare request from Node is refused, the same
 * request with a browser User-Agent succeeds, and Referer turns out not to matter at all.
 */
import {
  ProviderError,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
} from './types'

const PAGE = 'https://www.bing.com/translator'
const ENDPOINT = 'https://www.bing.com/ttranslatev3'

/** Renewed a little early, so a translation never starts with an expired token. */
const EXPIRY_MARGIN_MS = 30_000

/** Bing spells a few languages differently from everyone else. */
const BING_CODES: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  no: 'nb',
}

export type BingCredentials = {
  ig: string
  iid: string
  key: string
  token: string
  /** Absolute timestamp; the page gives a duration, not a deadline. */
  expiresAt: number
}

/**
 * The page carries the credentials in two places: an IG in a script blob, and a key, token
 * and lifetime in an array named after what it is for — abuse prevention.
 */
export function parseBingCredentials(html: string, now = Date.now()): BingCredentials {
  const ig = html.match(/IG:"([^"]+)"/)?.[1]
  const iid = html.match(/data-iid="([^"]+)"/)?.[1]
  const helper = html.match(/params_AbusePreventionHelper\s*=\s*\[([^\]]+)\]/)?.[1]

  if (!ig || !helper) {
    throw new ProviderError('provider-failed', 'bing: could not read the translator page')
  }

  const parts = helper.split(',').map((part) => part.trim().replace(/^"|"$/g, ''))
  const [key, token, lifetime] = parts

  if (!key || !token) {
    throw new ProviderError('provider-failed', 'bing: no credentials on the translator page')
  }

  const lifetimeMs = Number(lifetime)
  const valid = Number.isFinite(lifetimeMs) && lifetimeMs > 0 ? lifetimeMs : 600_000

  return {
    ig,
    // Missing IID is survivable; Bing accepts the request without it.
    iid: iid ?? 'translator.5028',
    key,
    token,
    expiresAt: now + Math.max(0, valid - EXPIRY_MARGIN_MS),
  }
}

/**
 * Shape as of 2026-09:
 *   [{ detectedLanguage: { language: "es" }, translations: [{ text: "...", to: "uk" }] }]
 * A refusal comes back as an object with a statusCode instead of an array.
 */
export function parseBingResponse(raw: unknown): TranslateResult {
  if (!Array.isArray(raw)) {
    const status = (raw as { statusCode?: unknown } | null)?.statusCode
    if (status !== undefined) {
      // 401 and 429 both mean "not with those credentials, not now".
      const code = status === 429 ? 'rate-limited' : 'provider-failed'
      throw new ProviderError(code, `bing: statusCode ${String(status)}`)
    }
    throw new ProviderError('provider-failed', 'bing: unexpected response')
  }

  const first = raw[0] as
    | { detectedLanguage?: { language?: unknown }; translations?: { text?: unknown }[] }
    | undefined
  const text = first?.translations?.[0]?.text

  if (typeof text !== 'string' || text === '') {
    throw new ProviderError('provider-failed', 'bing: no translated text')
  }

  const detected = first?.detectedLanguage?.language
  return {
    text,
    ...(typeof detected === 'string' && detected !== '' ? { detectedFrom: detected } : {}),
  }
}

function bingCode(code: string): string {
  return BING_CODES[code] ?? code
}

/** Cached between translations; the event page unloading simply costs one extra page fetch. */
let credentials: BingCredentials | null = null

export function forgetBingCredentials(): void {
  credentials = null
}

async function getCredentials(signal?: AbortSignal): Promise<BingCredentials> {
  if (credentials && credentials.expiresAt > Date.now()) return credentials

  let response: Response
  try {
    response = await fetch(PAGE, {
      credentials: 'omit',
      headers: { Accept: 'text/html' },
      ...(signal ? { signal } : {}),
    })
  } catch (cause) {
    throw new ProviderError('network', 'bing: could not load the translator page', cause)
  }

  if (!response.ok) {
    throw new ProviderError('provider-failed', `bing: translator page HTTP ${response.status}`)
  }

  credentials = parseBingCredentials(await response.text())
  return credentials
}

export const bing: TranslationProvider = {
  id: 'bing',

  async translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResult> {
    const auth = await getCredentials(signal)

    const body = new URLSearchParams({
      fromLang: request.from === 'auto' ? 'auto-detect' : bingCode(request.from),
      to: bingCode(request.to),
      text: request.text,
      token: auth.token,
      key: auth.key,
    })

    const url = `${ENDPOINT}?isVertical=1&IG=${encodeURIComponent(auth.ig)}&IID=${encodeURIComponent(auth.iid)}`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        ...(signal ? { signal } : {}),
      })
    } catch (cause) {
      throw new ProviderError('network', 'bing: request failed', cause)
    }

    if (response.status === 429) {
      forgetBingCredentials()
      throw new ProviderError('rate-limited', 'bing: HTTP 429')
    }
    if (!response.ok) {
      // Stale credentials look like a rejected request; the next attempt fetches fresh ones.
      forgetBingCredentials()
      throw new ProviderError('provider-failed', `bing: HTTP ${response.status}`)
    }

    let raw: unknown
    try {
      raw = await response.json()
    } catch (cause) {
      throw new ProviderError('provider-failed', 'bing: response is not JSON', cause)
    }

    try {
      return parseBingResponse(raw)
    } catch (error) {
      forgetBingCredentials()
      throw error
    }
  },
}
