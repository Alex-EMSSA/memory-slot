import { describe, expect, it } from 'vitest'
import type { Srs } from '../src/lib/store/db'
import { describeNext, isDue, review, type Grade } from '../src/lib/srs/sm2'

const NOW = 1_000_000_000_000
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

function card(patch: Partial<Srs> = {}): Srs {
  return {
    state: 'new',
    ease: 2.5,
    interval: 0,
    due: NOW,
    reps: 0,
    lapses: 0,
    step: 0,
    ...patch,
  }
}

function minutesUntil(srs: Srs): number {
  return Math.round((srs.due - NOW) / MINUTE)
}

function daysUntil(srs: Srs): number {
  return Math.round((srs.due - NOW) / DAY)
}

describe('a brand new card', () => {
  /** The one moment the reader is actually thinking about the word is now, not tomorrow. */
  it('comes back within the same sitting when forgotten', () => {
    const next = review(card(), 'again', NOW)
    expect(next.state).toBe('learning')
    expect(minutesUntil(next)).toBe(1)
  })

  it('advances a step when recalled', () => {
    const next = review(card(), 'good', NOW)
    expect(next.state).toBe('learning')
    expect(next.step).toBe(1)
    expect(minutesUntil(next)).toBe(10)
  })

  it('repeats the same step when it was hard', () => {
    const next = review(card({ state: 'learning', step: 1 }), 'hard', NOW)
    expect(next.step).toBe(1)
    expect(minutesUntil(next)).toBe(10)
  })

  it('skips the steps entirely when it was easy', () => {
    const next = review(card(), 'easy', NOW)
    expect(next.state).toBe('review')
    expect(daysUntil(next)).toBe(4)
  })

  it('graduates after the last step', () => {
    const next = review(card({ state: 'learning', step: 1 }), 'good', NOW)
    expect(next.state).toBe('review')
    expect(next.interval).toBe(1)
    expect(next.reps).toBe(1)
  })

  /** How hard the first minute felt says nothing about the coming months. */
  it('does not touch the ease while learning', () => {
    expect(review(card(), 'again', NOW).ease).toBe(2.5)
    expect(review(card(), 'hard', NOW).ease).toBe(2.5)
    expect(review(card({ state: 'learning', step: 1 }), 'good', NOW).ease).toBe(2.5)
  })
})

describe('a card in review', () => {
  const learned = card({ state: 'review', interval: 10, reps: 3 })

  it('grows the interval by the ease when recalled', () => {
    const next = review(learned, 'good', NOW)
    expect(next.interval).toBe(25)
    expect(daysUntil(next)).toBe(25)
    expect(next.reps).toBe(4)
  })

  it('grows it a little when recall was hard, and lowers the ease', () => {
    const next = review(learned, 'hard', NOW)
    expect(next.interval).toBe(12)
    expect(next.ease).toBeCloseTo(2.35, 5)
  })

  it('grows it a lot when recall was easy, and raises the ease', () => {
    const next = review(learned, 'easy', NOW)
    expect(next.ease).toBeCloseTo(2.65, 5)
    expect(next.interval).toBe(Math.round(10 * 2.65 * 1.3))
  })

  it('never leaves the interval standing still', () => {
    const stubborn = card({ state: 'review', interval: 1, ease: 1.3 })
    expect(review(stubborn, 'hard', NOW).interval).toBeGreaterThan(1)
  })

  it('caps the interval rather than scheduling a card for the next century', () => {
    const ancient = card({ state: 'review', interval: 3000, ease: 2.8 })
    expect(review(ancient, 'easy', NOW).interval).toBe(365 * 5)
  })
})

describe('forgetting a learned card', () => {
  const learned = card({ state: 'review', interval: 30, ease: 2.5, reps: 6 })

  it('brings it back in minutes, not tomorrow', () => {
    const next = review(learned, 'again', NOW)
    expect(next.state).toBe('relearning')
    expect(minutesUntil(next)).toBe(10)
  })

  it('counts the lapse and lowers the ease', () => {
    const next = review(learned, 'again', NOW)
    expect(next.lapses).toBe(1)
    expect(next.ease).toBeCloseTo(2.3, 5)
  })

  /** A lapse halves what the card had earned rather than throwing it away. */
  it('halves the interval instead of resetting it', () => {
    const lapsed = review(learned, 'again', NOW)
    expect(lapsed.interval).toBe(15)

    const back = review(lapsed, 'good', NOW)
    expect(back.state).toBe('review')
    expect(daysUntil(back)).toBe(15)
  })

  it('keeps a relearning card in relearning when forgotten again', () => {
    const lapsed = review(learned, 'again', NOW)
    const again = review(lapsed, 'again', NOW)
    expect(again.state).toBe('relearning')
    expect(minutesUntil(again)).toBe(10)
  })

  it('lets an easy answer end relearning at once', () => {
    const lapsed = review(learned, 'again', NOW)
    expect(review(lapsed, 'easy', NOW).state).toBe('review')
  })
})

describe('ease', () => {
  it('never falls below the floor, however often the card is failed', () => {
    let srs = card({ state: 'review', interval: 10 })
    for (let i = 0; i < 20; i += 1) {
      srs = review(srs, 'again', NOW)
      srs = review(srs, 'good', NOW)
    }
    expect(srs.ease).toBe(1.3)
  })

  it('does not drift through floating point noise', () => {
    let srs = card({ state: 'review', interval: 10 })
    for (let i = 0; i < 5; i += 1) srs = review(srs, 'easy', NOW)
    expect(srs.ease).toBeCloseTo(3.25, 10)
  })
})

describe('isDue', () => {
  it('is true once the time has come', () => {
    expect(isDue(card({ due: NOW }), NOW)).toBe(true)
    expect(isDue(card({ due: NOW + 1 }), NOW)).toBe(false)
  })
})

describe('describeNext', () => {
  it('tells the reader what each button will cost them', () => {
    const learned = card({ state: 'review', interval: 10 })
    expect(describeNext(card(), 'again', NOW)).toBe('1 min')
    expect(describeNext(card(), 'good', NOW)).toBe('10 min')
    expect(describeNext(learned, 'good', NOW)).toBe('25 d')
  })

  it('switches to months and years when the interval gets long', () => {
    expect(describeNext(card({ state: 'review', interval: 60 }), 'good', NOW)).toBe('5 mo')
    expect(describeNext(card({ state: 'review', interval: 300 }), 'good', NOW)).toBe('2.1 y')
  })
})

describe('every grade on every state', () => {
  const states: Srs['state'][] = ['new', 'learning', 'review', 'relearning']
  const grades: Grade[] = ['again', 'hard', 'good', 'easy']

  it('always moves the card forward in time and keeps it sane', () => {
    for (const state of states) {
      for (const grade of grades) {
        const next = review(card({ state, interval: state === 'new' ? 0 : 10 }), grade, NOW)

        expect(next.due).toBeGreaterThan(NOW)
        expect(next.ease).toBeGreaterThanOrEqual(1.3)
        expect(next.interval).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(next.due)).toBe(true)
      }
    }
  })
})
