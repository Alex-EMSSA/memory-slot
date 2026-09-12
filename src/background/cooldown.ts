/**
 * What to do when a provider says no.
 *
 * A 429 from a free endpoint is a refusal by IP address, and every further request while it
 * lasts both fails and prolongs it. So after a refusal we stop asking *that* provider for a
 * while and move to the next one; only when every provider is sulking does the reader see an
 * error, with the shortest remaining wait in it.
 *
 * Waits are per provider and double with each refusal in a row, resetting on the first
 * success, so a brief throttle costs a minute while a sustained block does not turn into a
 * steady stream of doomed requests.
 */

const STORAGE_KEY = 'cooldown.v2'

const FIRST_WAIT_MS = 60_000
const MAX_WAIT_MS = 15 * 60_000

type Entry = {
  /** Timestamp until which this provider is not contacted at all. */
  until: number
  /** How long the last wait was, so the next one can be longer. */
  lastWaitMs: number
}

type Record_ = Record<string, Entry>

/** Mirrored in memory because the event page is unloaded between translations. */
let cached: Record_ | null = null

async function read(): Promise<Record_> {
  if (cached) return cached

  try {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
    if (stored && typeof stored === 'object') {
      cached = stored as Record_
      return cached
    }
  } catch {
    // A forgotten cooldown means one wasted request, not a broken extension.
  }

  cached = {}
  return cached
}

async function write(next: Record_): Promise<void> {
  cached = next
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: next })
  } catch {
    // Same again.
  }
}

/** Seconds still to wait before this provider may be asked again; zero when it is free. */
export async function remainingSeconds(provider: string, now = Date.now()): Promise<number> {
  const entry = (await read())[provider]
  return entry && entry.until > now ? Math.ceil((entry.until - now) / 1000) : 0
}

export async function recordRefusal(provider: string, now = Date.now()): Promise<number> {
  const record = await read()
  const previous = record[provider]?.lastWaitMs ?? 0
  const wait = Math.min(MAX_WAIT_MS, previous === 0 ? FIRST_WAIT_MS : previous * 2)

  await write({ ...record, [provider]: { until: now + wait, lastWaitMs: wait } })
  return Math.ceil(wait / 1000)
}

/** One good answer means the block is over; the next refusal starts from the short wait again. */
export async function recordSuccess(provider: string): Promise<void> {
  const record = await read()
  if (!record[provider]) return

  const rest = { ...record }
  delete rest[provider]
  await write(rest)
}

export function describeWait(seconds: number): string {
  if (seconds < 90) return `${seconds} s`
  return `${Math.ceil(seconds / 60)} min`
}
