/**
 * Per-site enabling.
 *
 * The manifest declares no content_scripts at all. The script exists only as a registration
 * created here, and only for origins the user has granted. On a site that was never enabled
 * there is nothing of ours to run — that is the guarantee, and it is structural rather than
 * a flag someone can forget to check.
 *
 * The source of truth is the permission itself, never a list in storage: a user can revoke
 * access from about:addons without ever opening our UI.
 */
import { isApiOrigin } from '../lib/origin'

const CONTENT_SCRIPT_ID = 'memory-slot-content'
const CONTENT_SCRIPT_FILE = 'content.js'

/** Granted origins that are actual sites, i.e. everything except our own API hosts. */
export async function enabledSites(): Promise<string[]> {
  const granted = await browser.permissions.getAll()
  return (granted.origins ?? []).filter((pattern) => !isApiOrigin(pattern)).sort()
}

export async function isEnabled(pattern: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [pattern] })
}

/**
 * Brings the registration in line with the granted permissions. Safe to call at any time
 * and from any trigger: it computes the whole desired state rather than applying a delta.
 */
export async function syncRegistrations(): Promise<void> {
  const matches = await enabledSites()
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] })

  if (matches.length === 0) {
    if (existing.length > 0) {
      await browser.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] })
    }
    return
  }

  const script = {
    id: CONTENT_SCRIPT_ID,
    matches,
    js: [CONTENT_SCRIPT_FILE],
    runAt: 'document_idle' as const,
    allFrames: true,
    // Survives a browser restart; reconciled against real permissions on every startup.
    persistAcrossSessions: true,
  }

  if (existing.length > 0) {
    await browser.scripting.updateContentScripts([script])
  } else {
    await browser.scripting.registerContentScripts([script])
  }
}
