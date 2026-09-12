/**
 * Client-side throttle for the free Google endpoint.
 *
 * Two independent limits: a minimum gap between requests (so a fast reader dragging across
 * a paragraph does not fire a burst) and a ceiling per rolling window (so a runaway loop
 * cannot get the user's IP throttled). Exceeding the window is reported, never queued —
 * if Google is already refusing us, waiting in line is the wrong answer.
 */
import { ProviderError } from './providers/types'

export class RateLimiter {
  private lastAt = 0
  private hits: number[] = []
  /** Serialises acquire() so parallel callers cannot all read the same lastAt. */
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly minIntervalMs: number,
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {}

  acquire(): Promise<void> {
    const next = this.queue.then(() => this.take())
    this.queue = next.catch(() => undefined)
    return next
  }

  private async take(): Promise<void> {
    const now = Date.now()
    this.hits = this.hits.filter((at) => now - at < this.windowMs)

    if (this.hits.length >= this.maxPerWindow) {
      throw new ProviderError(
        'rate-limited',
        `local limit: ${this.maxPerWindow} requests per ${this.windowMs} ms`,
      )
    }

    const wait = this.minIntervalMs - (now - this.lastAt)
    if (wait > 0) await sleep(wait)

    this.lastAt = Date.now()
    this.hits.push(this.lastAt)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
