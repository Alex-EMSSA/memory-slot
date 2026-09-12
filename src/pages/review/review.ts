/**
 * The review session.
 *
 * Keyboard first: Space reveals the answer, then Space or 1–4 grades it. Reviewing is a daily
 * habit measured in minutes, and reaching for the mouse on every card is what kills it.
 */
import { describeNext, review, type Grade } from '../../lib/srs/sm2'
import { dueCards, updateSrs, type Card } from '../../lib/store/db'
import { getSettings } from '../../lib/store/settings'
import { recordAnswer, todayStats } from '../../lib/store/stats'

/** A card answered "again" comes back inside this window rather than tomorrow. */
const SESSION_HORIZON_MS = 20 * 60 * 1000

const GRADES: Grade[] = ['again', 'hard', 'good', 'easy']

let queue: Card[] = []
let current: Card | null = null
let revealed = false
let answered = 0

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`review: #${id} is missing`)
  return node as T
}

/**
 * Learning cards first, then reviews, then new ones. A card the reader is in the middle of
 * learning is the one they are closest to remembering.
 */
function buildQueue(cards: Card[], newAllowance: number, reviewAllowance: number): Card[] {
  const learning = cards.filter((card) => card.srs.state === 'learning' || card.srs.state === 'relearning')
  const reviews = cards.filter((card) => card.srs.state === 'review').slice(0, reviewAllowance)
  const fresh = cards.filter((card) => card.srs.state === 'new').slice(0, newAllowance)

  return [...learning, ...reviews, ...fresh]
}

async function load(): Promise<void> {
  const [settings, today, cards] = await Promise.all([getSettings(), todayStats(), dueCards()])

  const newAllowance = Math.max(0, settings.newPerDay - today.introduced)
  const reviewAllowance = Math.max(0, settings.reviewsPerDay - today.reviewed)

  queue = buildQueue(cards, newAllowance, reviewAllowance)
  next(settings.newPerDay, today.introduced)
}

function next(newPerDay = 0, introduced = 0): void {
  current = queue.shift() ?? null
  revealed = false

  if (!current) {
    finish(newPerDay, introduced)
    return
  }

  el('card').hidden = false
  el('done').hidden = true
  el('front').textContent = current.front
  el('back').hidden = true
  el('grades').hidden = true
  el('prompt').hidden = false
  render()
}

function render(): void {
  const left = queue.length + (current ? 1 : 0)
  el('progress').textContent = `${left} left · ${answered} done this session`
}

function reveal(): void {
  if (!current || revealed) return
  revealed = true

  el('translation').textContent = current.back

  const context = el('context')
  context.textContent = current.context ?? ''
  context.hidden = !current.context

  const source = el<HTMLAnchorElement>('source')
  if (current.sourceUrl) {
    source.href = current.sourceUrl
    source.textContent = current.sourceTitle || current.sourceUrl
    source.hidden = false
  } else {
    source.hidden = true
  }

  // Each button says what it will cost, so the choice is informed rather than superstitious.
  for (const grade of GRADES) {
    const when = document.querySelector(`[data-when="${grade}"]`)
    if (when) when.textContent = describeNext(current.srs, grade)
  }

  el('back').hidden = false
  el('grades').hidden = false
  el('prompt').hidden = true
}

async function grade(value: Grade): Promise<void> {
  const card = current
  if (!card || !revealed) return

  const wasNew = card.srs.state === 'new'
  const now = Date.now()
  const srs = review(card.srs, value, now)

  await updateSrs(card.id, srs)
  await recordAnswer(wasNew, now)
  answered += 1

  // Still inside this sitting: put it back in the queue rather than losing it until tomorrow.
  if (srs.due - now <= SESSION_HORIZON_MS) queue.push({ ...card, srs })

  next()
}

function finish(newPerDay: number, introduced: number): void {
  el('card').hidden = true
  el('done').hidden = false
  el('progress').textContent = `${answered} done this session`

  const heldBack = newPerDay > 0 && introduced >= newPerDay
  el('done-title').textContent = answered > 0 ? 'Done for now.' : 'Nothing due right now.'
  el('done-note').textContent = heldBack
    ? "You have met today's limit of new words. More are waiting tomorrow."
    : 'Come back when the next cards are due.'
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey) return

  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    // Space reveals, and then means "Good": the common answer needs no aim.
    if (revealed) void grade('good')
    else reveal()
    return
  }

  const index = Number(event.key) - 1
  if (revealed && index >= 0 && index < GRADES.length) {
    event.preventDefault()
    void grade(GRADES[index]!)
  }
}

async function init(): Promise<void> {
  el<HTMLAnchorElement>('cards').addEventListener('click', (event) => {
    event.preventDefault()
    void browser.tabs.create({ url: browser.runtime.getURL('manager.html') })
  })

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-grade]')) {
    button.addEventListener('click', () => {
      const value = button.dataset['grade'] as Grade
      void grade(value)
    })
  }

  el('stage').addEventListener('click', (event) => {
    // Clicking the card reveals it; clicking a grade button must not do both.
    if ((event.target as Element).closest('[data-grade]')) return
    reveal()
  })

  document.addEventListener('keydown', onKeyDown)

  await load()
}

void init()
