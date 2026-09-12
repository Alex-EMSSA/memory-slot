import { afterEach, describe, expect, it, vi } from 'vitest'
import { installBrowserStub, type BrowserStub } from './helpers/browser-stub'

/** Each test gets a fresh module instance: the cache keeps state at module scope. */
async function freshCache(stub: BrowserStub['store'] = {}) {
  vi.resetModules()
  const browserStub = installBrowserStub(stub)
  const module = await import('../src/lib/cache')
  return { ...module, store: browserStub.store }
}

const RESULT = { text: 'привіт', detectedFrom: 'en' }

describe('translation cache', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns what was stored', async () => {
    const cache = await freshCache()
    await cache.putCached('a', RESULT)
    expect(await cache.getCached('a')).toEqual(RESULT)
  })

  it('reports a miss for an unknown key', async () => {
    const cache = await freshCache()
    expect(await cache.getCached('nope')).toBeUndefined()
  })

  it('builds a key that separates language pairs and keeps case', async () => {
    const cache = await freshCache()
    expect(cache.cacheKey({ text: 'Apple', from: 'auto', to: 'uk' })).toBe('auto>uk:Apple')
    expect(cache.cacheKey({ text: 'apple', from: 'auto', to: 'uk' })).not.toBe(
      cache.cacheKey({ text: 'Apple', from: 'auto', to: 'uk' }),
    )
  })

  it('survives the event page being unloaded', async () => {
    const first = await freshCache()
    await first.putCached('auto>uk:hello', RESULT)
    await first.flushCache()

    // A new module instance is what a woken-up event page sees.
    const second = await freshCache(first.store)
    expect(await second.getCached('auto>uk:hello')).toEqual(RESULT)
  })

  it('forgets entries older than the seven day window', async () => {
    vi.useFakeTimers()
    const cache = await freshCache()
    await cache.putCached('stale', RESULT)

    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000)
    expect(await cache.getCached('stale')).toBeUndefined()
  })

  it('evicts the least recently used entry once full', async () => {
    const cache = await freshCache()
    for (let i = 0; i < 500; i += 1) {
      await cache.putCached(`key-${i}`, RESULT)
    }

    // Touching key-0 makes key-1 the oldest instead.
    await cache.getCached('key-0')
    await cache.putCached('key-500', RESULT)

    expect(await cache.getCached('key-0')).toEqual(RESULT)
    expect(await cache.getCached('key-1')).toBeUndefined()
    expect(await cache.getCached('key-500')).toEqual(RESULT)
  })

  it('batches writes instead of hitting storage on every translation', async () => {
    vi.useFakeTimers()
    const cache = await freshCache()

    await cache.putCached('a', RESULT)
    await cache.putCached('b', RESULT)
    expect(cache.store['translation-cache.v1']).toBeUndefined()

    await vi.advanceTimersByTimeAsync(2000)
    expect(Object.keys(cache.store['translation-cache.v1'] as object)).toEqual(['a', 'b'])
  })

  it('clears both memory and storage', async () => {
    const cache = await freshCache()
    await cache.putCached('a', RESULT)
    await cache.flushCache()

    await cache.clearCache()
    expect(await cache.getCached('a')).toBeUndefined()
    expect(cache.store['translation-cache.v1']).toBeUndefined()
  })

  it('ignores a corrupt stored cache rather than failing a translation', async () => {
    const cache = await freshCache({ 'translation-cache.v1': { broken: { nope: true } } })
    expect(await cache.getCached('broken')).toBeUndefined()
  })
})
