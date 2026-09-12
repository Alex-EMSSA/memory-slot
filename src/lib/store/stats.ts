/**
 * How much was studied, by day.
 *
 * Kept as a handful of counters rather than a log of every answer: the only questions worth
 * asking are "have I done my cards today" and "have I kept it up this week", and a per-answer
 * history to answer those would be a database of its own.
 */

const STORAGE_KEY = 'stats.v1'

/** Enough for the week shown in the popup, plus room to notice a gap. */
const KEEP_DAYS = 30

export type DayStats = {
  /** Answers given, including a card seen twice in one session. */
  reviewed: number
  /** Cards met for the very first time, which is what the daily limit counts. */
  introduced: number
}

type StatsRecord = Record<string, DayStats>

/** Local date, not UTC: "today" has to mean the reader's today. */
export function dayKey(at = Date.now()): string {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function empty(): DayStats {
  return { reviewed: 0, introduced: 0 }
}

async function read(): Promise<StatsRecord> {
  try {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
    if (stored && typeof stored === 'object') return stored as StatsRecord
  } catch {
    // Statistics are not worth failing a review over.
  }
  return {}
}

export async function todayStats(at = Date.now()): Promise<DayStats> {
  const record = await read()
  return record[dayKey(at)] ?? empty()
}

export async function recordAnswer(wasNew: boolean, at = Date.now()): Promise<void> {
  const record = await read()
  const key = dayKey(at)
  const day = record[key] ?? empty()

  record[key] = {
    reviewed: day.reviewed + 1,
    introduced: day.introduced + (wasNew ? 1 : 0),
  }

  try {
    await browser.storage.local.set({ [STORAGE_KEY]: prune(record, at) })
  } catch {
    // Same again: a lost counter is not a lost card.
  }
}

/** Keeps the record from growing forever; nobody needs last spring's counts. */
function prune(record: StatsRecord, at: number): StatsRecord {
  const cutoff = dayKey(at - KEEP_DAYS * 24 * 60 * 60 * 1000)
  const kept: StatsRecord = {}
  for (const [day, stats] of Object.entries(record)) {
    if (day >= cutoff) kept[day] = stats
  }
  return kept
}

export type DayEntry = { date: string; stats: DayStats }

/** Oldest first, with the quiet days included: a gap is part of the picture. */
export async function recentStats(days = 7, at = Date.now()): Promise<DayEntry[]> {
  const record = await read()
  const entries: DayEntry[] = []

  for (let back = days - 1; back >= 0; back -= 1) {
    const date = dayKey(at - back * 24 * 60 * 60 * 1000)
    entries.push({ date, stats: record[date] ?? empty() })
  }

  return entries
}
