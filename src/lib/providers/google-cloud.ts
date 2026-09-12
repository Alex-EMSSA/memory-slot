/**
 * Official Google Cloud Translation API v2, used only when the user supplies their own key.
 * Stable and sanctioned, but billed to that key — so it is never the default.
 */
import { decodeEntities } from './entities'
import {
  ProviderError,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
} from './types'

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

export function createGoogleCloud(apiKey: string): TranslationProvider {
  return {
    id: 'google-cloud',

    async translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResult> {
      const body: Record<string, string> = {
        q: request.text,
        target: request.to,
        format: 'text',
      }
      if (request.from !== 'auto') body.source = request.from

      let response: Response
      try {
        response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          ...(signal ? { signal } : {}),
        })
      } catch (cause) {
        throw new ProviderError('network', 'cloud: request failed', cause)
      }

      // 403 here means a bad, restricted or unbilled key — the user must fix it, retrying cannot.
      if (response.status === 400 || response.status === 403) {
        throw new ProviderError('permission-denied', `cloud: HTTP ${response.status}`)
      }
      if (response.status === 429) {
        throw new ProviderError('rate-limited', 'cloud: HTTP 429')
      }
      if (!response.ok) {
        throw new ProviderError('provider-failed', `cloud: HTTP ${response.status}`)
      }

      let raw: unknown
      try {
        raw = await response.json()
      } catch (cause) {
        throw new ProviderError('provider-failed', 'cloud: response is not JSON', cause)
      }

      return parseCloudResponse(raw)
    },
  }
}

export function parseCloudResponse(raw: unknown): TranslateResult {
  const translation = (raw as { data?: { translations?: unknown[] } })?.data?.translations?.[0] as
    | { translatedText?: unknown; detectedSourceLanguage?: unknown }
    | undefined

  if (typeof translation?.translatedText !== 'string' || translation.translatedText === '') {
    throw new ProviderError('provider-failed', 'cloud: no translated text')
  }

  const detectedFrom =
    typeof translation.detectedSourceLanguage === 'string'
      ? translation.detectedSourceLanguage
      : undefined

  return {
    text: decodeEntities(translation.translatedText),
    ...(detectedFrom ? { detectedFrom } : {}),
  }
}
