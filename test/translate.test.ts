import { afterEach, describe, expect, it, vi } from 'vitest'
import { installBrowserStub, jsonResponse, textResponse } from './helpers/browser-stub'
import { rejection } from './helpers/rejection'

const GTX_HELLO = [[['привіт', 'hello', null, null, 10]], null, 'en']
const CLOUD_HELLO = { data: { translations: [{ translatedText: 'привіт' }] } }
const MYMEMORY_HELLO = { responseData: { translatedText: 'привіт' }, responseStatus: 200 }

/** Enough of the Bing translator page for the credentials to be read out of it. */
const BING_PAGE = `<html>var _G = {IG:"IG0123456789"};
<div data-iid="translator.5023"></div>
params_AbusePreventionHelper = [1757692800000,"tok3n",3600000];</html>`
const BING_HELLO = [{ detectedLanguage: { language: 'en' }, translations: [{ text: 'привіт' }] }]

/** Fresh modules per test: the cache and the rate limiter both keep module-scope state. */
async function loadTranslate(settings?: Record<string, unknown>) {
  vi.resetModules()
  installBrowserStub(settings ? { 'settings.v1': settings } : {})
  return import('../src/background/translate')
}

function stubFetch(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn((..._args: unknown[]) => {
    const next = responses.shift()
    if (next === undefined) throw new Error('fetch called more times than expected')
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('translate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('translates through the free endpoint', async () => {
    const { translate } = await loadTranslate()
    stubFetch(jsonResponse(GTX_HELLO))

    const result = await translate({ text: 'hello', from: 'auto', to: 'uk' })
    expect(result.text).toBe('привіт')
    expect(result.detectedFrom).toBe('en')
  })

  it('sends the selection as a query parameter, not in a header', async () => {
    const { translate } = await loadTranslate()
    const fetchMock = stubFetch(jsonResponse(GTX_HELLO))

    await translate({ text: 'hello', from: 'auto', to: 'uk' })

    const url = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(url.origin).toBe('https://translate.googleapis.com')
    expect(url.searchParams.get('q')).toBe('hello')
    expect(url.searchParams.get('tl')).toBe('uk')
  })

  /** The whole point of the cache: a repeated word must cost nothing. */
  it('serves a repeat from cache without touching the network', async () => {
    const { translate } = await loadTranslate()
    const fetchMock = stubFetch(jsonResponse(GTX_HELLO))

    await translate({ text: 'hello', from: 'auto', to: 'uk' })
    const second = await translate({ text: '  hello  ', from: 'auto', to: 'uk' })

    expect(second.text).toBe('привіт')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats differently cased words as different entries', async () => {
    const { translate } = await loadTranslate()
    const fetchMock = stubFetch(jsonResponse(GTX_HELLO), jsonResponse(GTX_HELLO))

    await translate({ text: 'apple', from: 'auto', to: 'uk' })
    await translate({ text: 'Apple', from: 'auto', to: 'uk' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to the settings when the caller names no languages', async () => {
    const { translate } = await loadTranslate({ targetLang: 'de', sourceLang: 'auto', apiKey: '' })
    const fetchMock = stubFetch(jsonResponse(GTX_HELLO))

    await translate({ text: 'hello' })

    const url = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(url.searchParams.get('tl')).toBe('de')
  })

  it('rejects empty input without a request', async () => {
    const { translate } = await loadTranslate()
    const fetchMock = stubFetch()

    const error = await rejection(translate({ text: '   ', to: 'uk' }))
    expect(error.code).toBe('bad-request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects input too long to be a flashcard', async () => {
    const { translate } = await loadTranslate()
    const fetchMock = stubFetch()

    const error = await rejection(translate({ text: 'x'.repeat(1001), to: 'uk' }))
    expect(error.code).toBe('bad-request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retries a dropped connection', async () => {
    vi.useFakeTimers()
    const { translate } = await loadTranslate()
    const fetchMock = stubFetch(new TypeError('NetworkError'), jsonResponse(GTX_HELLO))

    const pending = translate({ text: 'hello', from: 'auto', to: 'uk' })
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ text: 'привіт' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up with a typed error when the network stays down', async () => {
    vi.useFakeTimers()
    const { translate } = await loadTranslate()
    stubFetch(
      new TypeError('NetworkError'),
      new TypeError('NetworkError'),
      new TypeError('NetworkError'),
    )

    const pending = rejection(translate({ text: 'hello', from: 'auto', to: 'uk' }))
    await vi.runAllTimersAsync()

    expect((await pending).code).toBe('network')
  })

  /** Retrying a throttle is how a throttle becomes a block: one attempt each, no more. */
  it('does not retry a provider that throttled us', async () => {
    vi.useFakeTimers()
    const { translate } = await loadTranslate()
    const fetchMock = stubFetch(
      jsonResponse([], 429),
      textResponse(BING_PAGE),
      jsonResponse(BING_HELLO),
    )

    const pending = translate({ text: 'hello', from: 'auto', to: 'uk' })
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ text: 'привіт' })
    // Google once, then Bing's page and its endpoint. No second attempt at the one that refused.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  /** The whole point of a second provider: Google refusing must not stop the reader. */
  it('falls back to Bing when Google refuses', async () => {
    vi.useFakeTimers()
    const { translate } = await loadTranslate()
    const fetchMock = stubFetch(
      jsonResponse([], 429),
      textResponse(BING_PAGE),
      jsonResponse(BING_HELLO),
    )

    const pending = translate({ text: 'hello', from: 'auto', to: 'uk' })
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ text: 'привіт' })
    expect(new URL(fetchMock.mock.calls[2]?.[0] as string).origin).toBe('https://www.bing.com')
  })

  it('falls all the way through to MyMemory when both refuse', async () => {
    vi.useFakeTimers()
    const { translate } = await loadTranslate()
    const fetchMock = stubFetch(
      jsonResponse([], 429),
      textResponse(BING_PAGE),
      jsonResponse({ statusCode: 429 }),
      jsonResponse(MYMEMORY_HELLO),
    )

    const pending = translate({ text: 'hello', from: 'auto', to: 'uk' })
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ text: 'привіт' })
    expect(new URL(fetchMock.mock.calls[3]?.[0] as string).origin).toBe(
      'https://api.mymemory.translated.net',
    )
  })

  it('skips a provider that is still in its cooldown', async () => {
    vi.useFakeTimers()
    const { translate } = await loadTranslate()

    const first = stubFetch(jsonResponse([], 429), textResponse(BING_PAGE), jsonResponse(BING_HELLO))
    const pendingFirst = translate({ text: 'hello', from: 'auto', to: 'uk' })
    await vi.runAllTimersAsync()
    await pendingFirst
    expect(first).toHaveBeenCalledTimes(3)

    // A different word, so the cache cannot answer it. Google is still resting, and Bing's
    // credentials are still good, so this costs exactly one request.
    const second = stubFetch(jsonResponse(BING_HELLO))
    const pendingSecond = translate({ text: 'world', from: 'auto', to: 'uk' })
    await vi.runAllTimersAsync()
    await pendingSecond

    expect(second).toHaveBeenCalledTimes(1)
    expect(new URL(second.mock.calls[0]?.[0] as string).origin).toBe('https://www.bing.com')
  })

  it('reports the shortest wait when every provider has refused', async () => {
    vi.useFakeTimers()
    const { translate } = await loadTranslate()
    stubFetch(
      jsonResponse([], 429),
      textResponse(BING_PAGE),
      jsonResponse({ statusCode: 429 }),
      jsonResponse({ responseData: {}, responseStatus: 429 }, 429),
    )

    const pending = rejection(translate({ text: 'hello', from: 'auto', to: 'uk' }))
    await vi.runAllTimersAsync()

    const error = await pending
    expect(error.code).toBe('rate-limited')
    expect(error.message).toMatch(/Try again in \d+ s/)
  })

  it('prefers the user key when one is set', async () => {
    const { translate } = await loadTranslate({
      targetLang: 'uk',
      sourceLang: 'auto',
      apiKey: 'test-key',
    })
    const fetchMock = stubFetch(jsonResponse(CLOUD_HELLO))

    await translate({ text: 'hello' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new URL(url).origin).toBe('https://translation.googleapis.com')
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('test-key')
  })

  it('falls back from the user key to the free endpoint', async () => {
    vi.useFakeTimers()
    const { translate } = await loadTranslate({
      targetLang: 'uk',
      sourceLang: 'auto',
      apiKey: 'revoked',
    })
    const fetchMock = stubFetch(jsonResponse({ error: {} }, 403), jsonResponse(GTX_HELLO))

    const pending = translate({ text: 'hello' })
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ text: 'привіт' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
