/**
 * Taking the deck out and putting it back.
 *
 * There is no cloud and no account, so export is the only backup that exists. It has to be
 * lossless — including the review schedule, which is the part a learner cannot recreate.
 */
import { lookupKey, newSrs, type Card } from './db'

export const BACKUP_FORMAT = 'memory-slot'
export const BACKUP_VERSION = 1

export type Backup = {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: number
  cards: Card[]
}

export function toBackup(cards: Card[], now = Date.now()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, cards }
}

export class BackupError extends Error {}

/**
 * Reads a backup file. Anything missing is filled in rather than rejected: a backup that
 * restores nine cards out of ten is worth more than one that refuses to open.
 */
export function parseBackup(text: string): { cards: Card[]; skipped: number } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('That file is not valid JSON.')
  }

  const backup = raw as Partial<Backup>
  if (backup?.format !== BACKUP_FORMAT) {
    throw new BackupError('That file was not exported by Memory Slot.')
  }
  if (!Array.isArray(backup.cards)) {
    throw new BackupError('That backup has no cards in it.')
  }

  const cards: Card[] = []
  let skipped = 0

  for (const entry of backup.cards) {
    const card = reviveCard(entry)
    if (card) cards.push(card)
    else skipped += 1
  }

  return { cards, skipped }
}

function reviveCard(raw: unknown): Card | null {
  const input = raw as Partial<Card> | null
  if (!input || typeof input.front !== 'string' || typeof input.back !== 'string') return null
  if (input.front.trim() === '') return null

  const langTo = typeof input.langTo === 'string' ? input.langTo : 'en'
  const createdAt = typeof input.createdAt === 'number' ? input.createdAt : Date.now()

  return {
    id: typeof input.id === 'string' && input.id !== '' ? input.id : crypto.randomUUID(),
    front: input.front,
    back: input.back,
    lookup: lookupKey(input.front, langTo),
    langFrom: typeof input.langFrom === 'string' ? input.langFrom : 'auto',
    langTo,
    deckId: typeof input.deckId === 'string' ? input.deckId : 'default',
    tags: Array.isArray(input.tags) ? input.tags.filter((tag) => typeof tag === 'string') : [],
    createdAt,
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : createdAt,
    // The schedule is the part a learner cannot recreate, so it is kept whenever it is sane.
    srs: reviveSrs(input.srs, createdAt),
    ...(typeof input.context === 'string' ? { context: input.context } : {}),
    ...(typeof input.sourceUrl === 'string' ? { sourceUrl: input.sourceUrl } : {}),
    ...(typeof input.sourceTitle === 'string' ? { sourceTitle: input.sourceTitle } : {}),
  }
}

function reviveSrs(raw: unknown, fallbackDue: number): Card['srs'] {
  const srs = raw as Partial<Card['srs']> | null
  if (!srs || typeof srs.due !== 'number' || typeof srs.ease !== 'number') {
    return newSrs(fallbackDue)
  }

  return {
    state: srs.state ?? 'new',
    ease: srs.ease,
    interval: typeof srs.interval === 'number' ? srs.interval : 0,
    due: srs.due,
    reps: typeof srs.reps === 'number' ? srs.reps : 0,
    lapses: typeof srs.lapses === 'number' ? srs.lapses : 0,
  }
}

const CSV_COLUMNS = ['Front', 'Back', 'Context', 'Source', 'Tags'] as const

/** Anki reads this directly. Lossy on purpose: it carries the words, not the schedule. */
export function toCsv(cards: Card[]): string {
  const rows = [
    [...CSV_COLUMNS],
    ...cards.map((card) => [
      card.front,
      card.back,
      card.context ?? '',
      card.sourceUrl ?? '',
      card.tags.join(' '),
    ]),
  ]

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')
}

/**
 * Card text comes from arbitrary web pages, and a spreadsheet treats a leading =, + or @ as
 * a formula. Anki reads the apostrophe as part of nothing, so this costs the import nothing.
 */
function escapeCsv(value: string): string {
  const guarded = /^[=+@]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** A filename that sorts by date and does not collide with yesterday's export. */
export function backupFilename(extension: string, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10)
  return `memory-slot-${stamp}.${extension}`
}
