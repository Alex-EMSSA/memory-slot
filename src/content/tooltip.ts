/**
 * The translation tooltip: a small card that appears over the selected text and goes away
 * on its own. It has no close button by design — anything the user has to dismiss by hand
 * is one interaction too many for a gesture this cheap.
 *
 * It lives in a closed shadow root attached to documentElement. Closed keeps page scripts
 * out; documentElement rather than body because plenty of sites replace body wholesale.
 */
import { placeTooltip, type Box } from './placement'

const STYLES = `
:host { all: initial; }

.box {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  display: block;
  max-width: 320px;
  padding: 7px 10px;
  border-radius: 8px;
  background: #ffffff;
  color: #1f2328;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
  pointer-events: none;
}

@media (prefers-color-scheme: dark) {
  .box {
    background: #26252b;
    color: #f2f2f4;
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
}

.text { font-weight: 500; }

.meta {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.6;
}

.error { color: #b3261e; }

@media (prefers-color-scheme: dark) {
  .error { color: #f2b8b5; }
}

.dots { display: inline-block; letter-spacing: 2px; opacity: 0.6; }

.dots::after {
  content: "···";
  animation: blink 1s steps(1, end) infinite;
}

@keyframes blink {
  0% { opacity: 0.35; }
  50% { opacity: 1; }
  100% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  .dots::after { animation: none; }
}
`

export class Tooltip {
  private host: HTMLElement | null = null
  private box: HTMLElement | null = null
  private anchor: Box | null = null

  /** The text this tooltip is currently about, so a repeat gesture can be ignored. */
  private subject = ''

  showLoading(rect: Box, subject: string): void {
    this.subject = subject
    const box = this.ensure()
    box.replaceChildren(element('div', 'dots', ''))
    this.place(rect)
  }

  showResult(rect: Box, text: string, meta: string): void {
    const box = this.ensure()
    box.replaceChildren(element('div', 'text', text))
    if (meta !== '') box.append(element('div', 'meta', meta))
    this.place(rect)
  }

  showError(rect: Box, message: string): void {
    const box = this.ensure()
    box.replaceChildren(element('div', 'text error', message))
    this.place(rect)
  }

  hide(): void {
    this.subject = ''
    this.anchor = null
    if (this.host) this.host.style.setProperty('display', 'none', 'important')
  }

  destroy(): void {
    this.host?.remove()
    this.host = null
    this.box = null
    this.anchor = null
    this.subject = ''
  }

  get visible(): boolean {
    return this.anchor !== null
  }

  get currentSubject(): string {
    return this.subject
  }

  /** Viewport rect of the tooltip itself, so the caller can tell when the pointer is on it. */
  get boxRect(): Box | null {
    if (!this.box || !this.anchor) return null
    const rect = this.box.getBoundingClientRect()
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
  }

  get anchorRect(): Box | null {
    return this.anchor
  }

  private ensure(): HTMLElement {
    if (this.box && this.host) {
      this.host.style.setProperty('display', 'block', 'important')
      return this.box
    }

    const host = document.createElement('div')
    // Inline and important, because the page's CSS reaches the host element itself.
    host.style.setProperty('all', 'initial', 'important')
    host.style.setProperty('position', 'fixed', 'important')
    host.style.setProperty('top', '0', 'important')
    host.style.setProperty('left', '0', 'important')
    host.style.setProperty('width', '0', 'important')
    host.style.setProperty('height', '0', 'important')
    host.style.setProperty('z-index', '2147483647', 'important')

    const root = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = STYLES
    const box = document.createElement('div')
    box.className = 'box'
    root.append(style, box)

    document.documentElement.append(host)

    this.host = host
    this.box = box
    return box
  }

  /** Measures first, then positions: the size depends on the text we just put in. */
  private place(rect: Box): void {
    const box = this.box
    if (!box) return

    this.anchor = rect

    box.style.setProperty('visibility', 'hidden', 'important')
    box.style.setProperty('left', '0px', 'important')
    box.style.setProperty('top', '0px', 'important')

    const size = { width: box.offsetWidth, height: box.offsetHeight }
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const placement = placeTooltip(rect, size, viewport)

    box.style.setProperty('left', `${Math.round(placement.left)}px`, 'important')
    box.style.setProperty('top', `${Math.round(placement.top)}px`, 'important')
    box.style.setProperty('visibility', 'visible', 'important')
  }
}

/** Content always goes in as text: a translation is untrusted data, not markup. */
function element(tag: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}
