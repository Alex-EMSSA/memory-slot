/**
 * Content script. It is never declared in the manifest: it exists only as a runtime
 * registration for sites the user has enabled, plus a one-off injection into the tab
 * that was open when they flipped the switch.
 *
 * M3 adds the double-click trigger and the tooltip. For now it announces itself so the
 * toolbar icon can light up, and it can be told to stop without a page reload.
 */
import { ok, type Request, type Response } from '../lib/messages'

declare global {
  var __memorySlotLoaded: boolean | undefined
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
  browser.runtime.onMessage.removeListener(onMessage)
  globalThis.__memorySlotLoaded = undefined
  console.debug('[memory-slot] stopped on', location.origin)
}

function start(): void {
  browser.runtime.onMessage.addListener(onMessage)

  // Only the top frame reports in: the icon belongs to the tab, not to every iframe in it.
  if (window.top === window) {
    void browser.runtime.sendMessage({ type: 'content-ready' } satisfies Request).catch(() => {
      // The background page may still be waking up; the icon will catch up on the next event.
    })
  }

  console.debug('[memory-slot] active on', location.origin)
}

// Toggling a site off and on re-injects the script into a page that never reloaded.
if (!globalThis.__memorySlotLoaded) {
  globalThis.__memorySlotLoaded = true
  start()
}
