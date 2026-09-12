/**
 * Background event page.
 *
 * This is the only context allowed to make network requests: a fetch from a content
 * script would hit the page's CSP and CORS rules, which differ from site to site.
 */
import { flushCache } from '../lib/cache'
import { fail, ok, type Request, type Response } from '../lib/messages'
import { asProviderError } from '../lib/providers/types'
import { getSettings, patchSettings } from '../lib/store/settings'
import { setToolbarState } from '../lib/toolbar'
import { enabledSites, syncRegistrations } from './site-gate'
import { translate } from './translate'

const VERSION = browser.runtime.getManifest().version

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.info(`[memory-slot] installed ${VERSION}`)
    // M9: open the onboarding page that explains per-site enabling.
  } else if (details.reason === 'update') {
    console.info(`[memory-slot] updated to ${VERSION}`)
  }
  void syncRegistrations()
})

browser.runtime.onStartup.addListener(() => {
  void syncRegistrations()
})

/**
 * Permissions can change without us: the user can revoke a site from about:addons.
 * Reconciling on the event keeps the registration honest whatever the trigger was.
 */
browser.permissions.onAdded.addListener(() => {
  void syncRegistrations()
})

browser.permissions.onRemoved.addListener(() => {
  void syncRegistrations()
})

browser.runtime.onMessage.addListener(
  (message: unknown, sender: browser.runtime.MessageSender): Promise<Response> | undefined => {
    const request = message as Request

    switch (request?.type) {
      case 'translate':
        return handleTranslate(request)
      case 'content-ready':
        return handleContentReady(sender)
      default:
        return undefined
    }
  },
)

async function handleTranslate(request: Extract<Request, { type: 'translate' }>): Promise<Response> {
  try {
    return ok(await translate(request))
  } catch (error) {
    const failure = asProviderError(error)
    console.warn('[memory-slot] translation failed:', failure.code, failure.message)
    // Kept verbatim: a friendly message in the tooltip is no use when diagnosing why.
    await recordDiagnostic({
      event: 'translation-failed',
      code: failure.code,
      detail: failure.message,
    })
    return fail(failure.code)
  }
}

/**
 * The content script only exists on enabled sites, so its arrival is the most reliable
 * signal we have that this tab is active — and it needs no permission to read tab URLs.
 */
async function handleContentReady(sender: browser.runtime.MessageSender): Promise<Response> {
  const tabId = sender.tab?.id
  console.info('[memory-slot] content-ready from tab', tabId)
  if (tabId === undefined) {
    await recordDiagnostic({ event: 'content-ready without tab id' })
    return fail('bad-request')
  }

  const badge = await setToolbarState(tabId, true)
  if (badge !== 'ok') await recordDiagnostic({ event: 'toolbar-failed', tabId, reason: badge })
  return ok({ acknowledged: true })
}

/**
 * Leaves a trace of what the background page actually did, readable from the popup.
 * An event page is unloaded when idle, so its console and its memory are both unreliable
 * places to look for what happened a minute ago.
 */
async function recordDiagnostic(entry: Record<string, unknown>): Promise<void> {
  try {
    await browser.storage.local.set({ 'diag.v1': { at: new Date().toISOString(), ...entry } })
  } catch {
    // Diagnostics must never break the thing they are diagnosing.
  }
}

// A tab starting a new navigation is off until its content script says otherwise.
browser.tabs.onUpdated.addListener(
  (tabId, changeInfo) => {
    if (changeInfo.status === 'loading') void setToolbarState(tabId, false)

  },
  { properties: ['status'] },
)

// The event page is unloaded when idle; pending cache writes must not go with it.
browser.runtime.onSuspend.addListener(() => {
  void flushCache()
})

void syncRegistrations()

/**
 * Console handle for manual checks from about:debugging. Until the options page lands in M6
 * this is also the only way to change the target language:
 *   await memorySlot.patchSettings({ targetLang: 'uk' })
 *   await memorySlot.translate({ text: 'hello', from: 'auto', to: 'uk' })
 *   await memorySlot.enabledSites()
 */
Object.assign(globalThis, {
  memorySlot: {
    translate,
    flushCache,
    syncRegistrations,
    enabledSites,
    getSettings,
    patchSettings,
  },
})
