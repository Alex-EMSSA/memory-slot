/**
 * The floating card window.
 *
 * Lives above the page, starts in the top right corner, and is dragged, folded away or closed
 * by the reader. Its position is remembered across pages and restarts, because a window you
 * have to move again on every article is worse than no window.
 *
 * Like the tooltip it sits in a closed shadow root on documentElement: page CSS cannot reach
 * inside, page scripts cannot reach the root, and a site that replaces body cannot take it
 * down with it.
 */
import { readableTextColour } from '../lib/colour'
import { clampToViewport, defaultPanelPosition } from './placement'
import { registerUiRoot, unregisterUiRoot } from './ui-roots'
import {
  defaultPanelState,
  flushPanelState,
  loadPanelState,
  savePanelState,
  type PanelState,
} from './panel-state'

export type CardContent = {
  original: string
  translation: string
  from: string
  to: string
  context?: string
}

const WIDTH = 300

const STYLES = `
:host {
  --ms-bg: #ffffff;
  --ms-fg: #1f2328;
  --ms-muted: #6b7280;
  --ms-line: #e5e7eb;
  --ms-head-bg: #f3f4f6;
  --ms-head-fg: #1f2328;
  --ms-shadow: rgba(0, 0, 0, 0.22);
}

@media (prefers-color-scheme: dark) {
  :host {
    --ms-bg: #26252b;
    --ms-fg: #f2f2f4;
    --ms-muted: #9ca3af;
    --ms-line: #3a3942;
    --ms-head-bg: #32313a;
    --ms-head-fg: #f2f2f4;
    --ms-shadow: rgba(0, 0, 0, 0.55);
  }
}

.frame {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: ${WIDTH}px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--ms-bg);
  color: var(--ms-fg);
  border: 1px solid var(--ms-line);
  box-shadow: 0 8px 28px var(--ms-shadow);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  text-align: left;
}

.head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 6px 6px 10px;
  background: var(--ms-head-bg);
  color: var(--ms-head-fg);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.head--dragging { cursor: grabbing; }

.head__title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.iconbutton {
  all: initial;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: inherit;
  font: 14px/1 system-ui, sans-serif;
  cursor: pointer;
}

.iconbutton:hover { background: rgba(127, 127, 127, 0.25); }
.iconbutton:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }

.body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.body[hidden] { display: none; }

.original {
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.translation {
  overflow-wrap: anywhere;
}

.langs {
  font-size: 11px;
  color: var(--ms-muted);
  text-transform: lowercase;
}

.context {
  padding-left: 8px;
  border-left: 2px solid var(--ms-line);
  color: var(--ms-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  gap: 8px;
  padding-top: 2px;
}

.button {
  all: initial;
  box-sizing: border-box;
  padding: 5px 10px;
  border: 1px solid var(--ms-line);
  border-radius: 6px;
  color: var(--ms-fg);
  font: 12px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.button:hover { border-color: var(--ms-muted); }
.button:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }

.empty {
  color: var(--ms-muted);
  font-size: 12px;
}
`

export class Panel {
  private host: HTMLElement | null = null
  private frame: HTMLElement | null = null
  private head: HTMLElement | null = null
  private body: HTMLElement | null = null
  private title: HTMLElement | null = null
  private fold: HTMLElement | null = null

  private state: PanelState = defaultPanelState()
  private colour = ''

  private dragging = false
  private grab = { x: 0, y: 0 }
  private observer: MutationObserver | null = null

  async init(): Promise<void> {
    this.state = await loadPanelState()
  }

  setColour(colour: string): void {
    this.colour = colour
    this.applyColour()
  }

  /** Fills the card and reveals the window, undoing a previous close. */
  show(content: CardContent): void {
    const body = this.ensure()

    this.state.closed = false
    savePanelState(this.state)

    body.replaceChildren()
    body.append(text('div', 'original', content.original))
    body.append(text('div', 'translation', content.translation))
    body.append(text('div', 'langs', `${content.from} → ${content.to}`))
    if (content.context) body.append(text('div', 'context', content.context))

    const actions = document.createElement('div')
    actions.className = 'actions'
    actions.append(this.speakButton(content.original, content.from))
    body.append(actions)

    this.applyVisibility()
  }

  destroy(): void {
    flushPanelState()
    this.observer?.disconnect()
    this.observer = null
    document.removeEventListener('fullscreenchange', this.onFullscreenChange)
    window.removeEventListener('resize', this.onResize)
    if (this.host) unregisterUiRoot(this.host)
    this.host?.remove()
    this.host = null
    this.frame = null
    this.head = null
    this.body = null
    this.title = null
    this.fold = null
  }

  private speakButton(phrase: string, language: string): HTMLElement {
    const button = document.createElement('button')
    button.className = 'button'
    button.type = 'button'
    button.textContent = 'Speak'
    button.addEventListener('click', () => {
      try {
        const utterance = new SpeechSynthesisUtterance(phrase)
        utterance.lang = language
        speechSynthesis.cancel()
        speechSynthesis.speak(utterance)
      } catch {
        // No voice for that language, or the page forbids it. Not worth an error card.
      }
    })
    return button
  }

  private ensure(): HTMLElement {
    if (this.body && this.host) return this.body

    const host = document.createElement('div')
    for (const [property, value] of [
      ['all', 'initial'],
      ['position', 'fixed'],
      ['top', '0'],
      ['left', '0'],
      ['width', '0'],
      ['height', '0'],
      ['z-index', '2147483647'],
    ] as const) {
      host.style.setProperty(property, value, 'important')
    }

    const root = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = STYLES

    const frame = document.createElement('div')
    frame.className = 'frame'

    const head = document.createElement('div')
    head.className = 'head'

    const title = document.createElement('div')
    title.className = 'head__title'
    title.textContent = 'Memory Slot'

    const fold = iconButton('–', 'Minimise')
    fold.addEventListener('click', () => this.toggleMinimised())
    this.fold = fold

    const close = iconButton('×', 'Close')
    close.addEventListener('click', () => this.close())

    head.append(title, fold, close)
    head.addEventListener('pointerdown', this.onPointerDown)
    head.addEventListener('pointermove', this.onPointerMove)
    head.addEventListener('pointerup', this.onPointerUp)
    head.addEventListener('pointercancel', this.onPointerUp)

    const body = document.createElement('div')
    body.className = 'body'

    frame.append(head, body)
    root.append(style, frame)
    document.documentElement.append(host)
    registerUiRoot(host)

    this.host = host
    this.frame = frame
    this.head = head
    this.body = body
    this.title = title

    this.applyColour()
    this.applyPosition()
    this.watchStackingOrder()
    document.addEventListener('fullscreenchange', this.onFullscreenChange)
    window.addEventListener('resize', this.onResize)

    return body
  }

  /**
   * Some sites append their own overlays after ours, which puts them on top however high our
   * z-index is. Moving back to the end is cheap; the observer settles after one pass because
   * the second notification finds us already last.
   */
  private watchStackingOrder(): void {
    this.observer = new MutationObserver(() => {
      const host = this.host
      if (!host?.parentElement) return
      if (host.parentElement.lastElementChild !== host) host.parentElement.append(host)
    })
    this.observer.observe(document.documentElement, { childList: true })
  }

  /** A fixed element disappears when the page goes fullscreen unless it moves inside it. */
  private onFullscreenChange = (): void => {
    const host = this.host
    if (!host) return
    const target = document.fullscreenElement ?? document.documentElement
    if (host.parentElement !== target) target.append(host)
  }

  private onResize = (): void => {
    this.applyPosition()
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    if (!startsDrag(event.target)) return

    const frame = this.frame
    const head = this.head
    if (!frame || !head) return

    const rect = frame.getBoundingClientRect()
    this.grab = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    this.dragging = true
    head.classList.add('head--dragging')
    head.setPointerCapture(event.pointerId)
    // Our own header, not the page: this only stops the drag selecting text.
    event.preventDefault()
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return
    this.moveTo(event.clientX - this.grab.x, event.clientY - this.grab.y)
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.dragging) return
    this.dragging = false
    this.head?.classList.remove('head--dragging')
    this.head?.releasePointerCapture(event.pointerId)
    flushPanelState()
  }

  private moveTo(x: number, y: number): void {
    const frame = this.frame
    if (!frame) return

    const size = { width: frame.offsetWidth, height: frame.offsetHeight }
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const position = clampToViewport(x, y, size, viewport)

    frame.style.setProperty('left', `${Math.round(position.x)}px`, 'important')
    frame.style.setProperty('top', `${Math.round(position.y)}px`, 'important')

    this.state.x = position.x
    this.state.y = position.y
    savePanelState(this.state)
  }

  private applyPosition(): void {
    const frame = this.frame
    if (!frame) return

    const size = { width: frame.offsetWidth || WIDTH, height: frame.offsetHeight }
    const viewport = { width: window.innerWidth, height: window.innerHeight }

    const wanted =
      this.state.x === null || this.state.y === null
        ? defaultPanelPosition(size, viewport)
        : clampToViewport(this.state.x, this.state.y, size, viewport)

    frame.style.setProperty('left', `${Math.round(wanted.x)}px`, 'important')
    frame.style.setProperty('top', `${Math.round(wanted.y)}px`, 'important')
  }

  private toggleMinimised(): void {
    this.state.minimized = !this.state.minimized
    savePanelState(this.state)
    flushPanelState()
    this.applyVisibility()
  }

  private close(): void {
    this.state.closed = true
    savePanelState(this.state)
    flushPanelState()
    this.applyVisibility()
  }

  private applyVisibility(): void {
    const host = this.host
    const body = this.body
    if (!host || !body) return

    host.style.setProperty('display', this.state.closed ? 'none' : 'block', 'important')
    body.hidden = this.state.minimized
    if (this.title) this.title.textContent = 'Memory Slot'

    // The button shows what pressing it will do, not what the window currently is.
    if (this.fold) {
      const label = this.state.minimized ? 'Expand' : 'Minimise'
      this.fold.textContent = this.state.minimized ? '+' : '–'
      this.fold.setAttribute('aria-label', label)
      this.fold.title = label
    }

    // Folding changes the height, so the window may now hang off the bottom of the screen.
    this.applyPosition()
  }

  private applyColour(): void {
    const host = this.host
    if (!host) return

    if (this.colour === '') {
      host.style.removeProperty('--ms-head-bg')
      host.style.removeProperty('--ms-head-fg')
      return
    }

    host.style.setProperty('--ms-head-bg', this.colour)
    host.style.setProperty('--ms-head-fg', readableTextColour(this.colour))
  }
}

/**
 * Whether a pointerdown in the header should begin a drag.
 *
 * The header captures the pointer while dragging, and a captured pointer never delivers its
 * click to the child it started on — which is how the minimise and close buttons ended up
 * doing nothing. A press on a control is a click, not a drag.
 */
export function startsDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  return target.closest('.iconbutton') === null
}

function iconButton(glyph: string, label: string): HTMLElement {
  const button = document.createElement('button')
  button.className = 'iconbutton'
  button.type = 'button'
  button.textContent = glyph
  button.setAttribute('aria-label', label)
  button.title = label
  return button
}

/** Card content always goes in as text: a translation is untrusted data, not markup. */
function text(tag: string, className: string, content: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = content
  return node
}
