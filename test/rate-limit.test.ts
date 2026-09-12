import { afterEach, describe, expect, it, vi } from 'vitest'
import { RateLimiter } from '../src/lib/rate-limit'
import { rejection } from './helpers/rejection'

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lets the first request through immediately', async () => {
    vi.useFakeTimers()
    const limiter = new RateLimiter(300, 60, 60_000)
    await expect(limiter.acquire()).resolves.toBeUndefined()
  })

  it('holds the next request until the minimum gap has passed', async () => {
    vi.useFakeTimers()
    const limiter = new RateLimiter(300, 60, 60_000)
    await limiter.acquire()

    let released = false
    const pending = limiter.acquire().then(() => {
      released = true
    })

    await vi.advanceTimersByTimeAsync(299)
    expect(released).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(released).toBe(true)
  })

  it('spaces out a burst instead of letting parallel callers collide', async () => {
    vi.useFakeTimers()
    const limiter = new RateLimiter(300, 60, 60_000)

    const done: number[] = []
    const all = Promise.all(
      [0, 1, 2].map((index) => limiter.acquire().then(() => done.push(index))),
    )

    await vi.advanceTimersByTimeAsync(0)
    expect(done).toEqual([0])

    await vi.advanceTimersByTimeAsync(300)
    expect(done).toEqual([0, 1])

    await vi.advanceTimersByTimeAsync(300)
    await all
    expect(done).toEqual([0, 1, 2])
  })

  /** Queueing here would just keep hammering an endpoint that is already refusing us. */
  it('refuses rather than queues once the window budget is spent', async () => {
    vi.useFakeTimers()
    const limiter = new RateLimiter(0, 2, 60_000)

    await limiter.acquire()
    await limiter.acquire()

    const error = await rejection(limiter.acquire())
    expect(error.code).toBe('rate-limited')
  })

  it('lets requests through again once the window rolls over', async () => {
    vi.useFakeTimers()
    const limiter = new RateLimiter(0, 1, 1000)

    await limiter.acquire()
    await expect(limiter.acquire()).rejects.toThrow(/local limit/)

    vi.setSystemTime(Date.now() + 1001)
    await expect(limiter.acquire()).resolves.toBeUndefined()
  })
})
