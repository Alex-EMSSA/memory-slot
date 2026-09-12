/**
 * Our own elements on the page.
 *
 * The trigger listens for mouseup on the whole document, so a click on our own window is a
 * mouseup like any other. With a word still selected, closing the window re-fired the trigger
 * and the window reopened instantly — it looked exactly like a dead close button.
 *
 * Events from a closed shadow root arrive at the document retargeted to the host element,
 * so recognising the hosts is enough.
 */

const roots = new Set<Element>()

export function registerUiRoot(root: Element): void {
  roots.add(root)
}

export function unregisterUiRoot(root: Element): void {
  roots.delete(root)
}

export function isOurUi(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false
  for (const root of roots) {
    if (root === target || root.contains(target)) return true
  }
  return false
}
