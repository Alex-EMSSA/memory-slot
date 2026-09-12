/**
 * SM-2 with learning steps, the variant Anki uses.
 *
 * Textbook SM-2 sends a forgotten card to "tomorrow", which wastes the one moment the reader
 * is actually thinking about it. Learning steps bring it back within the same sitting, and
 * only then let it out into days.
 *
 * A pure function on purpose: this is the one piece of the extension whose mistakes are
 * invisible for weeks and then quietly ruin months of study.
 */
import type { Srs } from '../store/db'

export type Grade = 'again' | 'hard' | 'good' | 'easy'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Minutes to wait at each step before a new card graduates into days. */
const LEARNING_STEPS_MIN = [1, 10]
/** A lapsed card gets one short step before it is trusted again. */
const RELEARNING_STEPS_MIN = [10]

const GRADUATING_INTERVAL_DAYS = 1
const EASY_INTERVAL_DAYS = 4

/** Below this a card comes back so often it becomes noise; SM-2's own floor. */
const MIN_EASE = 1.3
const EASE_DELTA: Record<Grade, number> = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 }

const HARD_FACTOR = 1.2
const EASY_BONUS = 1.3

/** A lapse halves what the card had earned rather than throwing it away. */
const LAPSE_FACTOR = 0.5

/** Five years is past the point where a longer interval means anything. */
const MAX_INTERVAL_DAYS = 365 * 5

export function isDue(srs: Srs, at = Date.now()): boolean {
  return srs.due <= at
}

export function review(srs: Srs, grade: Grade, now = Date.now()): Srs {
  switch (srs.state) {
    case 'new':
    case 'learning':
      return learn(srs, grade, now, LEARNING_STEPS_MIN)
    case 'relearning':
      return learn(srs, grade, now, RELEARNING_STEPS_MIN)
    case 'review':
      return recall(srs, grade, now)
  }
}

/**
 * Ease is deliberately untouched while learning: the reader is meeting the word for the
 * first time, and how hard the first minute felt says nothing about the coming months.
 */
function learn(srs: Srs, grade: Grade, now: number, steps: number[]): Srs {
  const relearning = srs.state === 'relearning'
  const step = srs.step ?? 0

  // A relearning card already had its interval halved when it lapsed; halving again here
  // would punish the same mistake twice and shrink the card away over a few slips.
  if (grade === 'easy') {
    return graduate(srs, now, relearning ? srs.interval : EASY_INTERVAL_DAYS)
  }

  if (grade === 'again') {
    return { ...srs, state: relearning ? 'relearning' : 'learning', step: 0, due: now + steps[0]! * MINUTE }
  }

  // Hard repeats the step the card is on; good advances to the next one.
  const next = grade === 'good' ? step + 1 : step

  if (next >= steps.length) {
    return graduate(srs, now, relearning ? srs.interval : GRADUATING_INTERVAL_DAYS)
  }

  return {
    ...srs,
    state: relearning ? 'relearning' : 'learning',
    step: next,
    due: now + steps[next]! * MINUTE,
  }
}

function graduate(srs: Srs, now: number, intervalDays: number): Srs {
  const interval = clampInterval(intervalDays)
  return {
    ...srs,
    state: 'review',
    step: 0,
    interval,
    due: now + interval * DAY,
    reps: srs.reps + 1,
  }
}

/** What a card is worth once it comes back from a lapse: half of what it had earned. */
function intervalAfterLapse(srs: Srs): number {
  return Math.max(1, Math.round(srs.interval * LAPSE_FACTOR))
}

function recall(srs: Srs, grade: Grade, now: number): Srs {
  const ease = nextEase(srs.ease, grade)

  if (grade === 'again') {
    return {
      ...srs,
      state: 'relearning',
      step: 0,
      ease,
      // Remembered now, applied when the card graduates again.
      interval: intervalAfterLapse(srs),
      due: now + RELEARNING_STEPS_MIN[0]! * MINUTE,
      lapses: srs.lapses + 1,
    }
  }

  const grown =
    grade === 'hard'
      ? srs.interval * HARD_FACTOR
      : grade === 'easy'
        ? srs.interval * ease * EASY_BONUS
        : srs.interval * ease

  // Always at least a day more than last time, or an interval can sit still forever.
  const interval = clampInterval(Math.max(srs.interval + 1, Math.round(grown)))

  return {
    ...srs,
    state: 'review',
    step: 0,
    ease,
    interval,
    due: now + interval * DAY,
    reps: srs.reps + 1,
  }
}

function nextEase(ease: number, grade: Grade): number {
  return Math.max(MIN_EASE, Number((ease + EASE_DELTA[grade]).toFixed(4)))
}

function clampInterval(days: number): number {
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)))
}

/** Human-readable "when will I see this again", for the buttons in the review screen. */
export function describeNext(srs: Srs, grade: Grade, now = Date.now()): string {
  const next = review(srs, grade, now)
  const minutes = Math.round((next.due - now) / MINUTE)

  if (minutes < 60) return `${Math.max(1, minutes)} min`
  const days = Math.round((next.due - now) / DAY)
  if (days < 1) return `${Math.round(minutes / 60)} h`
  if (days < 30) return `${days} d`
  if (days < 365) return `${Math.round(days / 30)} mo`
  return `${(days / 365).toFixed(1)} y`
}
