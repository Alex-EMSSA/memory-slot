import { describe, expect, it, vi } from 'vitest'
import { installBrowserStub } from './helpers/browser-stub'

async function freshCooldown(initial: Record<string, unknown> = {}) {
  vi.resetModules()
  const stub = installBrowserStub(initial)
  const module = await import('../src/background/cooldown')
  return { ...module, store: stub.store }
}

const NOW = 1_000_000

describe('cooldown', () => {
  it('lets requests through when nothing has gone wrong', async () => {
    const cooldown = await freshCooldown()
    expect(await cooldown.remainingSeconds('gtx', NOW)).toBe(0)
  })

  it('holds requests back for a minute after the first refusal', async () => {
    const cooldown = await freshCooldown()

    expect(await cooldown.recordRefusal('gtx', NOW)).toBe(60)
    expect(await cooldown.remainingSeconds('gtx', NOW)).toBe(60)
    expect(await cooldown.remainingSeconds('gtx', NOW + 30_000)).toBe(30)
  })

  it('lets requests through once the wait is over', async () => {
    const cooldown = await freshCooldown()
    await cooldown.recordRefusal('gtx', NOW)

    expect(await cooldown.remainingSeconds('gtx', NOW + 60_001)).toBe(0)
  })

  /** A block that keeps going must not turn into a steady stream of doomed requests. */
  it('doubles the wait with each refusal in a row', async () => {
    const cooldown = await freshCooldown()

    expect(await cooldown.recordRefusal('gtx', NOW)).toBe(60)
    expect(await cooldown.recordRefusal('gtx', NOW + 61_000)).toBe(120)
    expect(await cooldown.recordRefusal('gtx', NOW + 200_000)).toBe(240)
  })

  it('stops doubling at fifteen minutes', async () => {
    const cooldown = await freshCooldown()
    let wait = 0
    for (let attempt = 0; attempt < 10; attempt += 1) wait = await cooldown.recordRefusal('gtx', NOW)

    expect(wait).toBe(15 * 60)
  })

  it('forgets the whole thing after one good answer', async () => {
    const cooldown = await freshCooldown()
    await cooldown.recordRefusal('gtx', NOW)
    await cooldown.recordRefusal('gtx', NOW)

    await cooldown.recordSuccess('gtx')

    expect(await cooldown.remainingSeconds('gtx', NOW)).toBe(0)
    expect(await cooldown.recordRefusal('gtx', NOW)).toBe(60)
  })

  /** One sulking endpoint must not silence the others: that is the point of the rotation. */
  it('keeps the wait for each provider separate', async () => {
    const cooldown = await freshCooldown()
    await cooldown.recordRefusal('gtx', NOW)

    expect(await cooldown.remainingSeconds('gtx', NOW)).toBe(60)
    expect(await cooldown.remainingSeconds('mymemory', NOW)).toBe(0)
  })

  /** The event page is unloaded between translations, so the wait has to outlive it. */
  it('survives the background page being unloaded', async () => {
    const first = await freshCooldown()
    await first.recordRefusal('gtx', NOW)

    const second = await freshCooldown(first.store)
    expect(await second.remainingSeconds('gtx', NOW + 10_000)).toBe(50)
  })
})

describe('describeWait', () => {
  it('counts in seconds while that is still meaningful', async () => {
    const cooldown = await freshCooldown()
    expect(cooldown.describeWait(45)).toBe('45 s')
  })

  it('switches to minutes for a long block', async () => {
    const cooldown = await freshCooldown()
    expect(cooldown.describeWait(240)).toBe('4 min')
    expect(cooldown.describeWait(900)).toBe('15 min')
  })
})
