import { describe, expect, it } from 'vitest'
import { parseBingCredentials, parseBingResponse } from '../src/lib/providers/bing'
import { ProviderError } from '../src/lib/providers/types'

/** Trimmed to the parts we read, in the shape and order the real page puts them. */
const PAGE = `
<!DOCTYPE html><html><head>
<script type="text/javascript">//<![CDATA[
var _G = {Region:"eu",IG:"A1B2C3D4E5F64A7B8C9D0E1F2A3B4C5D",EventID:"x"};
//]]></script></head>
<body>
<div id="rich_tta" data-iid="translator.5023">
<script>params_AbusePreventionHelper = [1757692800000,"Tok3n_VaLue-xyz",3600000];</script>
</div></body></html>
`

const NOW = 1_000_000

describe('parseBingCredentials', () => {
  it('reads everything the endpoint asks for', () => {
    const auth = parseBingCredentials(PAGE, NOW)

    expect(auth.ig).toBe('A1B2C3D4E5F64A7B8C9D0E1F2A3B4C5D')
    expect(auth.iid).toBe('translator.5023')
    expect(auth.key).toBe('1757692800000')
    expect(auth.token).toBe('Tok3n_VaLue-xyz')
  })

  /** Renewed a little early, so a translation never starts with a token about to expire. */
  it('turns the lifetime into a deadline, with a margin', () => {
    expect(parseBingCredentials(PAGE, NOW).expiresAt).toBe(NOW + 3_600_000 - 30_000)
  })

  it('falls back to a default lifetime when the page gives nonsense', () => {
    const page = PAGE.replace('3600000', 'null')
    expect(parseBingCredentials(page, NOW).expiresAt).toBe(NOW + 600_000 - 30_000)
  })

  /** A missing iid is survivable; the endpoint accepts the request without a real one. */
  it('carries on without the iid', () => {
    const page = PAGE.replace('data-iid="translator.5023"', '')
    expect(parseBingCredentials(page, NOW).iid).toBeTruthy()
  })

  it('gives up when the page has no credentials on it', () => {
    expect(() => parseBingCredentials('<html>signed out</html>', NOW)).toThrow(ProviderError)
  })

  it('gives up when the abuse-prevention array is empty', () => {
    const page = PAGE.replace('1757692800000,"Tok3n_VaLue-xyz",3600000', '')
    expect(() => parseBingCredentials(page, NOW)).toThrow(/credentials|translator page/)
  })
})

describe('parseBingResponse', () => {
  const good = [
    { detectedLanguage: { language: 'es', score: 1 }, translations: [{ text: 'привіт', to: 'uk' }] },
  ]

  it('reads the translation and the detected language', () => {
    expect(parseBingResponse(good)).toEqual({ text: 'привіт', detectedFrom: 'es' })
  })

  it('works without a detected language', () => {
    const raw = [{ translations: [{ text: 'привіт' }] }]
    expect(parseBingResponse(raw)).toEqual({ text: 'привіт' })
  })

  /** Stale credentials come back as a plain object with a status code, not as an error. */
  it('treats a status code as a provider failure', () => {
    try {
      parseBingResponse({ statusCode: 401 })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as ProviderError).code).toBe('provider-failed')
    }
  })

  it('treats 429 as rate limiting, so the cooldown kicks in', () => {
    try {
      parseBingResponse({ statusCode: 429 })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as ProviderError).code).toBe('rate-limited')
    }
  })

  it('rejects an empty or malformed payload', () => {
    expect(() => parseBingResponse([])).toThrow(ProviderError)
    expect(() => parseBingResponse([{ translations: [] }])).toThrow(ProviderError)
    expect(() => parseBingResponse('nonsense')).toThrow(ProviderError)
  })
})
