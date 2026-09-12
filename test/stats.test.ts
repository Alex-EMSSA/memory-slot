import { afterEach, describe, expect, it, vi } from 'vitest'
import { installBrowserStub } from './helpers/browser-stub'

const DAY = 24 * 60 * 60 * 1000
/** Midday, so adding or subtracting hours in a test cannot slide into another date. */
const NOON = new Date('2026-09-12T12:00:00').getTime()

async function freshStats(initial: Record<string, unknown> = {}) {
  vi.resetModules()
  const stub = installBrowserStub(initial)
  const module = await import('../src/lib/store/stats')
  return { ...module, store: stub.store }
}

describe('dayKey', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is the local date, because "today" means the reader\'s today', async () => {
    const stats = await freshStats()
    expect(stats.dayKey(NOON)).toBe('2026-09-12')
  })

  it('pads months and days so the keys sort as text', async () => {
    const stats = await freshStats()
    expect(stats.dayKey(new Date('2026-01-05T12:00:00').getTime())).toBe('2026-01-05')
  })
})

describe('recordAnswer', () => {
  it('counts answers and, separately, words met for the first time', async () => {
    const stats = await freshStats()

    await stats.recordAnswer(true, NOON)
    await stats.recordAnswer(false, NOON)
    await stats.recordAnswer(false, NOON)

    expect(await stats.todayStats(NOON)).toEqual({ reviewed: 3, introduced: 1 })
  })

  it('keeps days apart', async () => {
    const stats = await freshStats()

    await stats.recordAnswer(true, NOON - DAY)
    await stats.recordAnswer(false, NOON)

    expect(await stats.todayStats(NOON)).toEqual({ reviewed: 1, introduced: 0 })
    expect(await stats.todayStats(NOON - DAY)).toEqual({ reviewed: 1, introduced: 1 })
  })

  it('reports an untouched day as zero rather than missing', async () => {
    const stats = await freshStats()
    expect(await stats.todayStats(NOON)).toEqual({ reviewed: 0, introduced: 0 })
  })

  /** Nobody needs last spring's counts, and the record would grow forever. */
  it('forgets days older than a month', async () => {
    const stats = await freshStats()

    await stats.recordAnswer(false, NOON - 40 * DAY)
    await stats.recordAnswer(false, NOON)

    const stored = stats.store['stats.v1'] as Record<string, unknown>
    expect(Object.keys(stored)).toEqual(['2026-09-12'])
  })
})

describe('recentStats', () => {
  it('returns a full week, oldest first, with the quiet days included', async () => {
    const stats = await freshStats()
    await stats.recordAnswer(false, NOON)
    await stats.recordAnswer(false, NOON - 2 * DAY)

    const week = await stats.recentStats(7, NOON)

    expect(week).toHaveLength(7)
    expect(week[6]?.date).toBe('2026-09-12')
    expect(week[6]?.stats.reviewed).toBe(1)
    expect(week[4]?.stats.reviewed).toBe(1)
    expect(week[5]?.stats.reviewed).toBe(0)
  })

  it('survives a store that has never been written to', async () => {
    const stats = await freshStats()
    const week = await stats.recentStats(7, NOON)
    expect(week.every((day) => day.stats.reviewed === 0)).toBe(true)
  })
})
