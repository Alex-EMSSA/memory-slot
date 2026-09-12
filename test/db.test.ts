import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A fresh database per test: IndexedDB is global state and would leak between them. */
async function freshDb() {
  vi.resetModules()
  const module = await import('../src/lib/store/db')
  for (const card of await module.allCards()) await module.deleteCard(card.id)
  return module
}

const WORD = {
  front: 'bright',
  back: 'яскравий',
  langFrom: 'en',
  langTo: 'uk',
  context: 'The bright child solved it.',
  sourceUrl: 'https://example.com/article',
  sourceTitle: 'An article',
}

describe('lookupKey', () => {
  it('ignores case and spacing, so a repeat is not a duplicate', async () => {
    const db = await freshDb()
    expect(db.lookupKey('  Bright  ', 'uk')).toBe(db.lookupKey('bright', 'uk'))
    expect(db.lookupKey('two  words', 'uk')).toBe(db.lookupKey('two words', 'uk'))
  })

  it('keeps different target languages apart', async () => {
    const db = await freshDb()
    expect(db.lookupKey('bright', 'uk')).not.toBe(db.lookupKey('bright', 'ru'))
  })
})

describe('saveCard', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('stores everything the card needs, including where it came from', async () => {
    const db = await freshDb()
    const { card, previous } = await db.saveCard(WORD)

    expect(previous).toBeNull()
    expect(card).toMatchObject({
      front: 'bright',
      back: 'яскравий',
      langFrom: 'en',
      langTo: 'uk',
      context: 'The bright child solved it.',
      sourceUrl: 'https://example.com/article',
      sourceTitle: 'An article',
      deckId: 'default',
      tags: [],
    })
    expect(card.id).toMatch(/[0-9a-f-]{36}/)
  })

  it('starts a card as new and due immediately', async () => {
    const db = await freshDb()
    const { card } = await db.saveCard(WORD, 1000)

    expect(card.srs).toEqual({
      state: 'new',
      ease: 2.5,
      interval: 0,
      due: 1000,
      reps: 0,
      lapses: 0,
      step: 0,
    })
  })

  it('survives being read back, which is the whole point of a deck', async () => {
    const db = await freshDb()
    const { card } = await db.saveCard(WORD)

    expect(await db.getCard(card.id)).toMatchObject({ front: 'bright', back: 'яскравий' })
  })

  /** The reader met the word again, usually in a better sentence. Two cards is a chore. */
  it('updates an existing card instead of making a second one', async () => {
    const db = await freshDb()
    const first = await db.saveCard(WORD, 1000)

    const second = await db.saveCard(
      { ...WORD, front: 'Bright', back: 'світлий', context: 'A bright room.' },
      2000,
    )

    expect(second.previous?.id).toBe(first.card.id)
    expect(second.card.id).toBe(first.card.id)
    expect(second.card.back).toBe('світлий')
    expect(second.card.context).toBe('A bright room.')
    expect(await db.countCards()).toBe(1)
  })

  it('keeps the original creation date when updating', async () => {
    const db = await freshDb()
    await db.saveCard(WORD, 1000)
    const { card } = await db.saveCard({ ...WORD, back: 'інше' }, 5000)

    expect(card.createdAt).toBe(1000)
    expect(card.updatedAt).toBe(5000)
  })

  it('does not lose the review schedule when the card is updated', async () => {
    const db = await freshDb()
    const { card } = await db.saveCard(WORD, 1000)

    const reviewed = { ...card, srs: { ...card.srs, state: 'review' as const, reps: 4, due: 9000 } }
    await db.restoreCard(reviewed.id, reviewed)

    const { card: updated } = await db.saveCard({ ...WORD, back: 'нове' }, 2000)
    expect(updated.srs).toMatchObject({ state: 'review', reps: 4, due: 9000 })
  })

  it('treats the same word into another language as a separate card', async () => {
    const db = await freshDb()
    await db.saveCard(WORD)
    await db.saveCard({ ...WORD, langTo: 'ru', back: 'яркий' })

    expect(await db.countCards()).toBe(2)
  })
})

describe('restoreCard', () => {
  it('removes a card that had just been created', async () => {
    const db = await freshDb()
    const { card, previous } = await db.saveCard(WORD)

    await db.restoreCard(card.id, previous)
    expect(await db.getCard(card.id)).toBeUndefined()
  })

  it('puts back the previous version after an update', async () => {
    const db = await freshDb()
    await db.saveCard(WORD, 1000)
    const second = await db.saveCard({ ...WORD, back: 'світлий' }, 2000)

    await db.restoreCard(second.card.id, second.previous)

    expect(await db.getCard(second.card.id)).toMatchObject({ back: 'яскравий' })
    expect(await db.countCards()).toBe(1)
  })
})

describe('importCards', () => {
  /**
   * The acceptance test for the whole backup story: export, wipe, import, and the deck is
   * back — including the review schedule, which is the part a learner cannot recreate.
   */
  it('restores a deck into an empty database, schedule intact', async () => {
    const first = await freshDb()
    const { card } = await first.saveCard(WORD, 1000)
    const reviewed = { ...card, srs: { ...card.srs, state: 'review' as const, reps: 7, due: 5000 } }
    await first.restoreCard(reviewed.id, reviewed)

    const exported = JSON.parse(JSON.stringify(await first.allCards()))

    const second = await freshDb()
    expect(await second.countCards()).toBe(0)

    const result = await second.importCards(exported)
    expect(result).toEqual({ added: 1, replaced: 0 })

    const restored = (await second.allCards())[0]!
    expect(restored).toEqual(reviewed)
  })

  it('replaces a word already in the deck rather than duplicating it', async () => {
    const db = await freshDb()
    const { card } = await db.saveCard(WORD, 1000)

    const incoming = { ...card, id: 'from-another-machine', back: 'світлий' }
    const result = await db.importCards([incoming])

    expect(result).toEqual({ added: 0, replaced: 1 })
    expect(await db.countCards()).toBe(1)

    const stored = (await db.allCards())[0]!
    expect(stored.back).toBe('світлий')
    // The local id wins, so anything already pointing at this card still finds it.
    expect(stored.id).toBe(card.id)
  })

  it('imports nothing from an empty file without complaint', async () => {
    const db = await freshDb()
    expect(await db.importCards([])).toEqual({ added: 0, replaced: 0 })
  })
})

describe('countDue', () => {
  it('counts cards whose time has come and no others', async () => {
    const db = await freshDb()
    const { card } = await db.saveCard(WORD, 1000)

    expect(await db.countDue(500)).toBe(0)
    expect(await db.countDue(1000)).toBe(1)

    const later = { ...card, srs: { ...card.srs, due: 10_000 } }
    await db.restoreCard(later.id, later)

    expect(await db.countDue(5000)).toBe(0)
    expect(await db.countDue(10_000)).toBe(1)
  })

  it('is zero for an empty deck', async () => {
    const db = await freshDb()
    expect(await db.countDue()).toBe(0)
  })
})
