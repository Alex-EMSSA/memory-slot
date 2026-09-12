/**
 * What starts a translation: a double click on a word, or a phrase selected with the mouse.
 * Nothing else — no hover, no hotkey, no intermediate button to click.
 */
import { MAX_TRANSLATION_LENGTH } from '../lib/limits'

export type Trigger = {
  text: string
  /** Viewport rect of the selected text, used to anchor the tooltip. */
  rect: DOMRect
  /**
   * Past the limit. Reported rather than dropped: a selection that produces nothing at all
   * is indistinguishable from a broken extension.
   */
  tooLong: boolean
}

/**
 * A double click also produces a mouseup. Without this guard every double-clicked word
 * would be translated twice: once by each handler.
 */
const DOUBLE_CLICK_GUARD_MS = 300

export function isTranslatable(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  // Digits, punctuation and symbols on their own are never worth translating.
  return /\p{Letter}/u.test(trimmed)
}

export function isTooLong(text: string): boolean {
  return text.trim().length > MAX_TRANSLATION_LENGTH
}

/** Typing is not reading: we stay out of fields where the user is writing. */
export function isEditable(node: Node | null): boolean {
  let element: Element | null = node instanceof Element ? node : (node?.parentElement ?? null)

  while (element) {
    const tag = element.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true

    // The attribute is checked as well as the property: the property is the browser's
    // computed answer, the attribute is what the page actually declared.
    if (element instanceof HTMLElement && element.isContentEditable) return true
    const declared = element.getAttribute('contenteditable')
    if (declared !== null && declared !== 'false') return true

    element = element.parentElement
  }
  return false
}

export function readSelection(): Trigger | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  const text = selection.toString()
  if (!isTranslatable(text)) return null
  if (isEditable(selection.anchorNode)) return null

  const rect = selection.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null

  return { text: text.trim(), rect, tooLong: isTooLong(text) }
}

/**
 * Listens in the capture phase so a site that stops propagation cannot hide the gesture
 * from us. We never call preventDefault or stopPropagation, so the site's own handling of
 * the same click is untouched.
 */
export function startTrigger(onTrigger: (trigger: Trigger) => void): () => void {
  let lastDoubleClickAt = 0

  const emit = (): void => {
    const trigger = readSelection()
    if (trigger) onTrigger(trigger)
  }

  const onDoubleClick = (): void => {
    lastDoubleClickAt = Date.now()
    // Let the browser finish selecting the word under the cursor.
    setTimeout(emit, 0)
  }

  const onMouseUp = (): void => {
    if (Date.now() - lastDoubleClickAt < DOUBLE_CLICK_GUARD_MS) return
    setTimeout(emit, 0)
  }

  document.addEventListener('dblclick', onDoubleClick, true)
  document.addEventListener('mouseup', onMouseUp, true)

  return () => {
    document.removeEventListener('dblclick', onDoubleClick, true)
    document.removeEventListener('mouseup', onMouseUp, true)
  }
}
