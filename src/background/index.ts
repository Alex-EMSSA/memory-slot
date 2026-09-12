/**
 * Background event page.
 *
 * This is the only context allowed to make network requests: a fetch from a content
 * script would hit the page's CSP and CORS rules, which differ from site to site.
 *
 * M2 adds per-site enabling.
 */
import { flushCache } from '../lib/cache'
import { fail, ok, type Request, type Response } from '../lib/messages'
import { asProviderError } from '../lib/providers/types'
import { translate } from './translate'

const VERSION = browser.runtime.getManifest().version

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.info(`[memory-slot] installed ${VERSION}`)
    // M9: open the onboarding page that explains per-site enabling.
  } else if (details.reason === 'update') {
    console.info(`[memory-slot] updated to ${VERSION}`)
  }
})

browser.runtime.onMessage.addListener((message: unknown): Promise<Response> => {
  const request = message as Request

  switch (request?.type) {
    case 'translate':
      return handleTranslate(request)
    case 'site-status':
    case 'site-toggle':
      return Promise.resolve(fail('not-implemented'))
    default:
      return Promise.resolve(fail('bad-request'))
  }
})

async function handleTranslate(request: Extract<Request, { type: 'translate' }>): Promise<Response> {
  try {
    return ok(await translate(request))
  } catch (error) {
    const failure = asProviderError(error)
    console.warn('[memory-slot] translation failed:', failure.code, failure.message)
    return fail(failure.code)
  }
}

// The event page is unloaded when idle; pending cache writes must not go with it.
browser.runtime.onSuspend.addListener(() => {
  void flushCache()
})

/**
 * Console handle for manual checks from about:debugging:
 *   await memorySlot.translate({ text: 'hello', from: 'auto', to: 'uk' })
 */
Object.assign(globalThis, { memorySlot: { translate, flushCache } })
