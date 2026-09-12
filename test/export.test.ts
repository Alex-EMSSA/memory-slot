import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Card } from '../src/lib/store/db'
import {
  backupFilename,
  BackupError,
  parseBackup,
  toBackup,
  toCsv,
} from '../src/lib/store/export'

const CARD: Card = {
  id: 'a1',
  front: 'bright',
  back: 'яскравий',
  lookup: 'uk|bright',
  langFrom: 'en',
  langTo: 'uk',
  context: 'The bright child solved it.',
  sourceUrl: 'https://example.com/a',
  sourceTitle: 'An article',
  deckId: 'default',
  tags: ['news'],
  createdAt: 1000,
  updatedAt: 2000,
  srs: { state: 'review', ease: 2.3, interval: 6, due: 99_000, reps: 4, lapses: 1 },
}

describe('backup round trip', () => {
  /** Export is the only backup that exists, so it has to come back exactly. */
  it('restores a card unchanged, schedule included', () => {
    const text = JSON.stringify(toBackup([CARD]))
    const { cards, skipped } = parseBackup(text)

    expect(skipped).toBe(0)
    expect(cards[0]).toEqual(CARD)
  })

  it('restores many cards', () => {
    const second = { ...CARD, id: 'b2', front: 'dark', lookup: 'uk|dark' }
    const { cards } = parseBackup(JSON.stringify(toBackup([CARD, second])))
    expect(cards.map((card) => card.front)).toEqual(['bright', 'dark'])
  })
})

describe('parseBackup', () => {
  it('refuses a file that is not JSON', () => {
    expect(() => parseBackup('not json at all')).toThrow(BackupError)
  })

  it('refuses a JSON file from somewhere else', () => {
    expect(() => parseBackup(JSON.stringify({ cards: [] }))).toThrow(/not exported by Memory Slot/)
  })

  it('refuses a backup with no cards array', () => {
    expect(() => parseBackup(JSON.stringify({ format: 'memory-slot', version: 1 }))).toThrow(
      BackupError,
    )
  })

  /** Nine cards out of ten beats a file that refuses to open. */
  it('skips unreadable entries and keeps the rest', () => {
    const text = JSON.stringify({
      format: 'memory-slot',
      version: 1,
      exportedAt: 0,
      cards: [CARD, null, { front: '' }, { back: 'no front' }, { ...CARD, id: 'c3', front: 'dark' }],
    })

    const { cards, skipped } = parseBackup(text)
    expect(cards).toHaveLength(2)
    expect(skipped).toBe(3)
  })

  it('fills in what an older or hand-edited file leaves out', () => {
    const text = JSON.stringify({
      format: 'memory-slot',
      version: 1,
      cards: [{ front: 'word', back: 'слово' }],
    })

    const card = parseBackup(text).cards[0]!
    expect(card.id).toMatch(/[0-9a-f-]{36}/)
    expect(card.langTo).toBe('en')
    expect(card.deckId).toBe('default')
    expect(card.tags).toEqual([])
    expect(card.srs.state).toBe('new')
  })

  it('rebuilds the lookup key rather than trusting the file', () => {
    const text = JSON.stringify({
      format: 'memory-slot',
      version: 1,
      cards: [{ ...CARD, lookup: 'nonsense' }],
    })
    expect(parseBackup(text).cards[0]!.lookup).toBe('uk|bright')
  })

  it('replaces a nonsensical schedule instead of importing it', () => {
    const text = JSON.stringify({
      format: 'memory-slot',
      version: 1,
      cards: [{ ...CARD, srs: { state: 'review' } }],
    })
    expect(parseBackup(text).cards[0]!.srs).toMatchObject({ state: 'new', ease: 2.5 })
  })
})

describe('toCsv', () => {
  it('writes a header and one row per card', () => {
    const lines = toCsv([CARD]).split('\r\n')
    expect(lines[0]).toBe('Front,Back,Context,Source,Tags')
    expect(lines[1]).toBe('bright,яскравий,The bright child solved it.,https://example.com/a,news')
  })

  it('quotes fields containing commas, quotes or newlines', () => {
    const awkward: Card = {
      ...CARD,
      front: 'one, two',
      back: 'he said "no"',
      context: 'line\nbreak',
    }
    const row = toCsv([awkward]).split('\r\n')[1]!

    expect(row).toContain('"one, two"')
    expect(row).toContain('"he said ""no"""')
    expect(row).toContain('"line\nbreak"')
  })

  /** Card text comes from arbitrary web pages, and a spreadsheet runs a leading = as a formula. */
  it('defuses text a spreadsheet would treat as a formula', () => {
    const nasty: Card = { ...CARD, front: '=1+1', back: '@SUM(A1)' }
    const row = toCsv([nasty]).split('\r\n')[1]!

    expect(row.startsWith("'=1+1")).toBe(true)
    expect(row).toContain("'@SUM(A1)")
  })

  it('handles a card with no context, source or tags', () => {
    const bare: Card = { ...CARD, tags: [] }
    delete bare.context
    delete bare.sourceUrl

    expect(toCsv([bare]).split('\r\n')[1]).toBe('bright,яскравий,,,')
  })
})

describe('backupFilename', () => {
  it('sorts by date and does not collide with yesterday', () => {
    expect(backupFilename('json', new Date('2026-09-12T10:00:00Z'))).toBe(
      'memory-slot-2026-09-12.json',
    )
  })
})
