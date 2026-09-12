/**
 * Background event page.
 *
 * This is the only context allowed to make network requests: a fetch from a content
 * script would hit the page's CSP and CORS rules, which differ from site to site.
 */
import { flushCache } from '../lib/cache'
import { fail, ok, type Request, type Response } from '../lib/messages'
import { asProviderError } from '../lib/providers/types'
import { ICON_OFF, ICON_ON, TITLE_OFF, TITLE_ON } from '../lib/icons'
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
    return fail(failure.code)
  }
}

/**
 * The content script only exists on enabled sites, so its arrival is the most reliable
 * signal we have that this tab is active — and it needs no permission to read tab URLs.
 */
async function handleContentReady(sender: browser.runtime.MessageSender): Promise<Response> {
  const tabId = sender.tab?.id
  if (tabId === undefined) return fail('bad-request')

  await setTabIcon(tabId, true)
  return ok({ acknowledged: true })
}

async function setTabIcon(tabId: number, on: boolean): Promise<void> {
  try {
    await browser.action.setIcon({ tabId, path: on ? ICON_ON : ICON_OFF })
    await browser.action.setTitle({ tabId, title: on ? TITLE_ON : TITLE_OFF })
  } catch {
    // The tab can be gone by the time we get here; nothing to recover.
  }
}

// A tab starting a new navigation is off until its content script says otherwise.
browser.tabs.onUpdated.addListener(
  (tabId, changeInfo) => {
    if (changeInfo.status === 'loading') void setTabIcon(tabId, false)
  },
  { properties: ['status'] },
)

// The event page is unloaded when idle; pending cache writes must not go with it.
browser.runtime.onSuspend.addListener(() => {
  void flushCache()
})

void syncRegistrations()

/**
 * Console handle for manual checks from about:debugging:
 *   await memorySlot.translate({ text: 'hello', from: 'auto', to: 'uk' })
 *   await memorySlot.enabledSites()
 */
Object.assign(globalThis, { memorySlot: { translate, flushCache, syncRegistrations, enabledSites } })
