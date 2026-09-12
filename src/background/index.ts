/**
 * Background event page.
 *
 * This is the only context allowed to make network requests: a fetch from a content
 * script would hit the page's CSP and CORS rules, which differ from site to site.
 *
 * M1 adds the translation orchestrator, M2 adds per-site enabling. For now this is the
 * message router and nothing else.
 */
import { fail, type Request, type Response } from '../lib/messages'

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
  console.debug('[memory-slot] request', request?.type)

  switch (request?.type) {
    case 'translate':
    case 'site-status':
    case 'site-toggle':
      return Promise.resolve(fail('not-implemented'))
    default:
      return Promise.resolve(fail('bad-request'))
  }
})
