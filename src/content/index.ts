/**
 * Content script. It is never declared in the manifest: it exists only as a runtime
 * registration for sites the user has enabled, plus a one-off injection into the tab
 * that was open when they flipped the switch.
 *
 * Double-click a word or select a phrase, and the translation appears over the text.
 * M4 adds the floating card window.
 */
import { ok, send, type ErrorCode, type Request, type Response } from '../lib/messages'
import { MAX_TRANSLATION_LENGTH } from '../lib/limits'
import { getSettings, SETTINGS_KEY } from '../lib/store/settings'
import { Panel } from './panel'
import { contains } from './placement'
import { Tooltip } from './tooltip'
import { startTrigger, type Trigger } from './trigger'

declare global {
  var __memorySlotLoaded: boolean | undefined
}

/** Long enough to survive a shaky hand crossing a gap, short enough to feel instant. */
const HIDE_DELAY_MS = 150

/** Pointer slack around the text and the tooltip, in pixels. */
const HOVER_SLACK = 12

/**
 * How long a freshly arrived translation is protected from the hover-away rule.
 *
 * Without this, a slow answer is wasted: the user drags across a phrase, moves the mouse
 * while waiting, and the result lands in a tooltip that has already been dismissed.
 */
const GRACE_MS = 1200

const tooltip = new Tooltip()

/** Only the top frame owns a window: one card per tab, not one per advertisement iframe. */
const panel = window.top === window ? new Panel() : null

/** Bumped on every gesture so a slow answer for an old word cannot overwrite a new one. */
let generation = 0
let hideTimer: number | undefined
let stopTrigger: (() => void) | null = null

/** A request is in flight: moving the mouse must not throw away the answer we are waiting for. */
let waiting = false

/** When the current result appeared, for the grace period above. */
let shownAt = 0

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  network: 'No connection.',
  'rate-limited': 'Google is turning us away. Try again in a minute.',
  'provider-failed': 'The translation service failed.',
  'permission-denied': 'Your Google API key was refused.',
  'bad-request': 'Nothing to translate here.',
  'not-implemented': 'Not available yet.',
}

function cancelHide(): void {
  if (hideTimer !== undefined) {
    clearTimeout(hideTimer)
    hideTimer = undefined
  }
}

function scheduleHide(): void {
  if (hideTimer !== undefined) return
  hideTimer = window.setTimeout(() => {
    hideTimer = undefined
    tooltip.hide()
  }, HIDE_DELAY_MS)
}

function hideNow(): void {
  cancelHide()
  waiting = false
  shownAt = 0
  tooltip.hide()
}

async function onTrigger(trigger: Trigger): Promise<void> {
  // The same word twice in a row is a repeat gesture, not a new request.
  if (tooltip.visible && tooltip.currentSubject === trigger.text) {
    cancelHide()
    return
  }

  if (trigger.tooLong) {
    cancelHide()
    generation += 1
    waiting = false
    shownAt = Date.now()
    tooltip.showError(
      trigger.rect,
      `Too long to translate: ${trigger.text.length} characters, the limit is ${MAX_TRANSLATION_LENGTH}.`,
    )
    return
  }

  const id = ++generation
  cancelHide()
  waiting = true
  tooltip.showLoading(trigger.rect, trigger.text)

  const response = await send<{ text: string; from: string; to: string }>({
    type: 'translate',
    text: trigger.text,
  })

  // Superseded by a newer gesture, or dismissed deliberately while we waited.
  if (id !== generation || !tooltip.visible) {
    if (id === generation) waiting = false
    return
  }

  waiting = false
  shownAt = Date.now()

  if (!response.ok) {
    tooltip.showError(trigger.rect, response.detail ?? ERROR_MESSAGES[response.error])
    return
  }

  tooltip.showResult(trigger.rect, response.data.text)

  panel?.show({
    original: trigger.text,
    translation: response.data.text,
    from: response.data.from,
    to: response.data.to,
    ...(trigger.context ? { context: trigger.context } : {}),
  })
}

/** Moving onto other text is the dismissal gesture: nothing has to be clicked. */
function onMouseOver(event: MouseEvent): void {
  if (!tooltip.visible) return

  // Waiting for an answer, or the answer has only just arrived: the user gets to read it.
  // Escape, a click and scrolling still dismiss, because those are deliberate.
  if (waiting || Date.now() - shownAt < GRACE_MS) {
    cancelHide()
    return
  }

  const anchor = tooltip.anchorRect
  const box = tooltip.boxRect
  const nearAnchor = anchor !== null && contains(anchor, event.clientX, event.clientY, HOVER_SLACK)
  const nearBox = box !== null && contains(box, event.clientX, event.clientY, HOVER_SLACK)

  if (nearAnchor || nearBox) cancelHide()
  else scheduleHide()
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') hideNow()
}

function onMessage(message: unknown): Promise<Response> | undefined {
  const request = message as Request

  switch (request?.type) {
    case 'ping':
      return Promise.resolve(ok({ alive: true, url: location.href }))
    case 'content-stop':
      stop()
      return Promise.resolve(ok({ stopped: true }))
    default:
      // Not ours: let other listeners answer instead of swallowing the message.
      return undefined
  }
}

function stop(): void {
  stopTrigger?.()
  stopTrigger = null

  browser.storage.local.onChanged.removeListener(onStorageChanged)
  document.removeEventListener('mouseover', onMouseOver, true)
  document.removeEventListener('mousedown', hideNow, true)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('scroll', hideNow, true)
  window.removeEventListener('resize', hideNow)
  browser.runtime.onMessage.removeListener(onMessage)

  cancelHide()
  tooltip.destroy()
  panel?.destroy()
  globalThis.__memorySlotLoaded = undefined
  console.info('[memory-slot] stopped on', location.origin)
}

/** Applied live, so changing the colour in the settings does not need a page reload. */
function onStorageChanged(changes: Record<string, browser.storage.StorageChange>): void {
  const change = changes[SETTINGS_KEY]
  if (!change) return
  const next = change.newValue as { tooltipColour?: string } | undefined
  tooltip.setColour(next?.tooltipColour ?? '')
  panel?.setColour(next?.tooltipColour ?? '')
}

function start(): void {
  browser.runtime.onMessage.addListener(onMessage)
  browser.storage.local.onChanged.addListener(onStorageChanged)

  void getSettings().then((settings) => {
    tooltip.setColour(settings.tooltipColour)
    panel?.setColour(settings.tooltipColour)
  })

  void panel?.init()

  stopTrigger = startTrigger((trigger) => void onTrigger(trigger))

  document.addEventListener('mouseover', onMouseOver, true)
  document.addEventListener('mousedown', hideNow, true)
  document.addEventListener('keydown', onKeyDown, true)
  // Scrolling moves the text out from under the tooltip, so the tooltip goes.
  window.addEventListener('scroll', hideNow, { capture: true, passive: true })
  window.addEventListener('resize', hideNow)

  // Only the top frame reports in: the badge belongs to the tab, not to every iframe in it.
  if (window.top === window) {
    void browser.runtime.sendMessage({ type: 'content-ready' } satisfies Request).catch(() => {
      // The background page may still be waking up; the badge will catch up on the next event.
    })
  }

  console.info('[memory-slot] active on', location.origin)
}

// Toggling a site off and on re-injects the script into a page that never reloaded.
if (!globalThis.__memorySlotLoaded) {
  globalThis.__memorySlotLoaded = true
  start()
}
