import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkGoogleKey,
  createGoogleCloud,
  parseCloudResponse,
} from '../src/lib/providers/google-cloud'
import { ProviderError } from '../src/lib/providers/types'

const OK_BODY = {
  data: { translations: [{ translatedText: 'bonjour', detectedSourceLanguage: 'en' }] },
}

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn((..._args: unknown[]) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function status(code: number): Response {
  return new Response('{}', { status: code })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseCloudResponse', () => {
  it('reads the translation and the detected language', () => {
    const result = parseCloudResponse({
      data: { translations: [{ translatedText: 'привіт', detectedSourceLanguage: 'en' }] },
    })
    expect(result).toEqual({ text: 'привіт', detectedFrom: 'en' })
  })

  it('works without a detected language, which the API omits when source is given', () => {
    const result = parseCloudResponse({ data: { translations: [{ translatedText: 'привіт' }] } })
    expect(result.detectedFrom).toBeUndefined()
  })

  it('rejects an empty payload', () => {
    expect(() => parseCloudResponse({ data: { translations: [] } })).toThrow(ProviderError)
  })
})

describe('createGoogleCloud', () => {
  /** A key in the query string ends up in every URL log between here and Google. */
  it('sends the key in a header, never in the URL', async () => {
    const fetchMock = stubFetch(Response.json(OK_BODY))

    await createGoogleCloud('AIzaSecret').translate({ text: 'hello', from: 'auto', to: 'fr' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('AIzaSecret')
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('AIzaSecret')
    expect(JSON.parse(init.body as string)).toEqual({ q: 'hello', target: 'fr', format: 'text' })
  })
})

describe('checkGoogleKey', () => {
  it('reports a working key', async () => {
    stubFetch(Response.json(OK_BODY))
    expect(await checkGoogleKey('k')).toBe('valid')
  })

  it.each([
    [400, 'refused'],
    [403, 'refused'],
    [429, 'rate-limited'],
    [500, 'failed'],
  ] as const)('maps HTTP %i to %s', async (code, expected) => {
    stubFetch(status(code))
    expect(await checkGoogleKey('k')).toBe(expected)
  })

  it('reports a dropped connection as such, not as a bad key', async () => {
    stubFetch(new TypeError('NetworkError'))
    expect(await checkGoogleKey('k')).toBe('network')
  })
})
