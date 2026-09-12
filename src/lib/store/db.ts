/**
 * The card store.
 *
 * Lives in IndexedDB in the background page, and nowhere else. A content script's IndexedDB
 * belongs to the page it runs on, not to the extension: cards written there would be scattered
 * across every site the reader visits and wiped whenever they clear a site's data.
 */

const DB_NAME = 'memory-slot'
const DB_VERSION = 1
const CARDS = 'cards'
const DECKS = 'decks'

export const DEFAULT_DECK_ID = 'default'

export type SrsState = 'new' | 'learning' | 'review' | 'relearning'

export type Srs = {
  state: SrsState
  ease: number
  /** Days until the next review. Zero while the card is still in learning steps. */
  interval: number
  due: number
  reps: number
  lapses: number
  /** Which learning step the card is on. Absent on cards saved before M8; treat as zero. */
  step?: number
}

export type Card = {
  id: string
  front: string
  back: string
  /** Normalised front plus target language: the key that turns a repeat into an update. */
  lookup: string
  langFrom: string
  langTo: string
  context?: string
  sourceUrl?: string
  sourceTitle?: string
  deckId: string
  tags: string[]
  createdAt: number
  updatedAt: number
  srs: Srs
}

export type NewCard = {
  front: string
  back: string
  langFrom: string
  langTo: string
  context?: string
  sourceUrl?: string
  sourceTitle?: string
  deckId?: string
  tags?: string[]
}

/** A card is new until the first review, so it is due immediately. M8 takes it from here. */
export function newSrs(now = Date.now()): Srs {
  return { state: 'new', ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, step: 0 }
}

/** Case and spacing must not be the difference between a repeat and a duplicate. */
export function lookupKey(front: string, langTo: string): string {
  return `${langTo}|${front.replace(/\s+/g, ' ').trim().toLowerCase()}`
}

let connection: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (connection) return connection

  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CARDS)) {
        const cards = db.createObjectStore(CARDS, { keyPath: 'id' })
        cards.createIndex('lookup', 'lookup', { unique: false })
        cards.createIndex('due', 'srs.due')
        cards.createIndex('deckId', 'deckId')
        cards.createIndex('createdAt', 'createdAt')
      }
      if (!db.objectStoreNames.contains(DECKS)) {
        db.createObjectStore(DECKS, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('cannot open the card store'))
  })

  return connection
}

/** Tests and a reset need the next open() to start from scratch. */
export function closeDb(): void {
  void connection?.then((db) => db.close())
  connection = null
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('card store request failed'))
  })
}

async function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await open()
  return db.transaction(CARDS, mode).objectStore(CARDS)
}

export async function findByLookup(front: string, langTo: string): Promise<Card | undefined> {
  const cards = await store('readonly')
  return wrap<Card | undefined>(cards.index('lookup').get(lookupKey(front, langTo)))
}

export type SaveResult = {
  card: Card
  /** The card as it was before, or null when it did not exist. Undo restores exactly this. */
  previous: Card | null
}

/**
 * Adding a word already in the deck updates it instead of making a second copy. The reader
 * met the word again — usually in a better sentence — and two cards for one word is a chore,
 * not a feature.
 */
export async function saveCard(input: NewCard, now = Date.now()): Promise<SaveResult> {
  const existing = await findByLookup(input.front, input.langTo)
  const cards = await store('readwrite')

  if (existing) {
    const updated: Card = {
      ...existing,
      back: input.back,
      langFrom: input.langFrom,
      updatedAt: now,
      ...(input.context ? { context: input.context } : {}),
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      ...(input.sourceTitle ? { sourceTitle: input.sourceTitle } : {}),
    }
    await wrap(cards.put(updated))
    return { card: updated, previous: existing }
  }

  const card: Card = {
    id: crypto.randomUUID(),
    front: input.front,
    back: input.back,
    lookup: lookupKey(input.front, input.langTo),
    langFrom: input.langFrom,
    langTo: input.langTo,
    deckId: input.deckId ?? DEFAULT_DECK_ID,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    srs: newSrs(now),
    ...(input.context ? { context: input.context } : {}),
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.sourceTitle ? { sourceTitle: input.sourceTitle } : {}),
  }

  await wrap(cards.add(card))
  return { card, previous: null }
}

/** Undo: put the old version back, or remove a card that had just been created. */
export async function restoreCard(id: string, previous: Card | null): Promise<void> {
  const cards = await store('readwrite')
  if (previous) await wrap(cards.put(previous))
  else await wrap(cards.delete(id))
}

export async function getCard(id: string): Promise<Card | undefined> {
  const cards = await store('readonly')
  return wrap<Card | undefined>(cards.get(id))
}

export async function deleteCard(id: string): Promise<void> {
  const cards = await store('readwrite')
  await wrap(cards.delete(id))
}

export async function allCards(): Promise<Card[]> {
  const cards = await store('readonly')
  return wrap<Card[]>(cards.getAll())
}

export async function countCards(): Promise<number> {
  const cards = await store('readonly')
  return wrap(cards.count())
}

export type ImportResult = { added: number; replaced: number }

/**
 * Restores a backup. A word already in the deck is replaced rather than duplicated, and the
 * incoming schedule wins: the file is the newer truth, otherwise there was no point restoring.
 */
export async function importCards(incoming: Card[]): Promise<ImportResult> {
  const result: ImportResult = { added: 0, replaced: 0 }

  for (const card of incoming) {
    const existing = await findByLookup(card.front, card.langTo)
    const cards = await store('readwrite')
    await wrap(cards.put(existing ? { ...card, id: existing.id } : card))
    if (existing) result.replaced += 1
    else result.added += 1
  }

  return result
}

export async function countDue(at = Date.now()): Promise<number> {
  const cards = await store('readonly')
  return wrap(cards.index('due').count(IDBKeyRange.upperBound(at)))
}

/** Cards whose time has come, soonest first. The review session works through this list. */
export async function dueCards(at = Date.now(), limit = 500): Promise<Card[]> {
  const cards = await store('readonly')
  const found = await wrap<Card[]>(cards.index('due').getAll(IDBKeyRange.upperBound(at), limit))
  return found.sort((a, b) => a.srs.due - b.srs.due)
}

/** Saves the schedule after an answer. The rest of the card is untouched. */
export async function updateSrs(id: string, srs: Srs): Promise<void> {
  const cards = await store('readwrite')
  const card = await wrap<Card | undefined>(cards.get(id))
  if (!card) return
  await wrap(cards.put({ ...card, srs }))
}
