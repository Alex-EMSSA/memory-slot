/**
 * Translation cache.
 *
 * This is not an optimisation. A double-click is a cheap gesture, users repeat words
 * constantly, and the free Google endpoint starts refusing traffic long before a human
 * runs out of curiosity. Every cache hit is a request we never make.
 *
 * It is persisted because a Firefox event page is unloaded when idle: an in-memory cache
 * would be empty again a minute later.
 */
import type { TranslateRequest, TranslateResult } from './providers/types'

const STORAGE_KEY = 'translation-cache.v1'
const MAX_ENTRIES = 500
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const PERSIST_DELAY_MS = 2000

type Entry = { value: TranslateResult; at: number }

/** Insertion order is the LRU order: least recent first. */
let entries: Map<string, Entry> | null = null
let persistTimer: ReturnType<typeof setTimeout> | undefined

export function cacheKey({ text, from, to }: TranslateRequest): string {
  // Case is kept: "Apple" and "apple" genuinely translate differently.
  return `${from}>${to}:${text}`
}

async function load(): Promise<Map<string, Entry>> {
  if (entries) return entries

  const map = new Map<string, Entry>()
  try {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
    if (stored && typeof stored === 'object') {
      const now = Date.now()
      for (const [key, entry] of Object.entries(stored as Record<string, Entry>)) {
        if (isFresh(entry, now)) map.set(key, entry)
      }
    }
  } catch {
    // A corrupt or unavailable store is not worth failing a translation over.
  }

  entries = map
  return map
}

function isFresh(entry: unknown, now: number): entry is Entry {
  const candidate = entry as Entry | undefined
  return (
    typeof candidate?.at === 'number' &&
    now - candidate.at < TTL_MS &&
    typeof candidate.value?.text === 'string'
  )
}

export async function getCached(key: string): Promise<TranslateResult | undefined> {
  const map = await load()
  const entry = map.get(key)
  if (!entry) return undefined

  if (!isFresh(entry, Date.now())) {
    map.delete(key)
    return undefined
  }

  // Re-insert to mark it as most recently used.
  map.delete(key)
  map.set(key, entry)
  return entry.value
}

export async function putCached(key: string, value: TranslateResult): Promise<void> {
  const map = await load()
  map.delete(key)
  map.set(key, { value, at: Date.now() })

  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next()
    if (oldest.done) break
    map.delete(oldest.value)
  }

  schedulePersist()
}

/** Batched: a burst of translations must not turn into a burst of storage writes. */
function schedulePersist(): void {
  if (persistTimer !== undefined) return
  persistTimer = setTimeout(() => {
    persistTimer = undefined
    void flushCache()
  }, PERSIST_DELAY_MS)
}

export async function flushCache(): Promise<void> {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer)
    persistTimer = undefined
  }
  if (!entries) return

  try {
    await browser.storage.local.set({ [STORAGE_KEY]: Object.fromEntries(entries) })
  } catch {
    // Losing the cache costs a few extra requests, not correctness.
  }
}

export async function clearCache(): Promise<void> {
  entries = new Map()
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer)
    persistTimer = undefined
  }
  try {
    await browser.storage.local.remove(STORAGE_KEY)
  } catch {
    // Nothing to do: the next write overwrites whatever is left.
  }
}
