/**
 * What to do when Google says no.
 *
 * A 429 from the free endpoint is a refusal by IP address, and every further request while it
 * lasts both fails and prolongs it. So after a refusal we stop asking for a while, serve the
 * cache, and tell the reader how long the wait is instead of failing silently on every word.
 *
 * The wait doubles with each refusal in a row and resets on the first success, so a brief
 * throttle costs a minute while a sustained block does not turn into a stream of requests.
 */

const STORAGE_KEY = 'cooldown.v1'

const FIRST_WAIT_MS = 60_000
const MAX_WAIT_MS = 15 * 60_000

type Cooldown = {
  /** Timestamp until which we do not contact the provider at all. */
  until: number
  /** How long the last wait was, so the next one can be longer. */
  lastWaitMs: number
}

/** Mirrored in memory because the event page is unloaded between translations. */
let cached: Cooldown | null = null

async function read(): Promise<Cooldown> {
  if (cached) return cached

  try {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
    if (stored && typeof stored === 'object') {
      cached = stored as Cooldown
      return cached
    }
  } catch {
    // A forgotten cooldown means one wasted request, not a broken extension.
  }

  cached = { until: 0, lastWaitMs: 0 }
  return cached
}

async function write(next: Cooldown): Promise<void> {
  cached = next
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: next })
  } catch {
    // Same again.
  }
}

/** Seconds still to wait, or zero when the provider may be asked again. */
export async function remainingSeconds(now = Date.now()): Promise<number> {
  const { until } = await read()
  return until > now ? Math.ceil((until - now) / 1000) : 0
}

export async function recordRefusal(now = Date.now()): Promise<number> {
  const current = await read()
  const wait = Math.min(MAX_WAIT_MS, current.lastWaitMs === 0 ? FIRST_WAIT_MS : current.lastWaitMs * 2)

  await write({ until: now + wait, lastWaitMs: wait })
  return Math.ceil(wait / 1000)
}

/** One good answer means the block is over; the next refusal starts from the short wait again. */
export async function recordSuccess(): Promise<void> {
  const current = await read()
  if (current.until === 0 && current.lastWaitMs === 0) return
  await write({ until: 0, lastWaitMs: 0 })
}

export function describeWait(seconds: number): string {
  if (seconds < 90) return `${seconds} s`
  return `${Math.ceil(seconds / 60)} min`
}
