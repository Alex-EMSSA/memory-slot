/**
 * Which sites the extension is allowed on.
 *
 * The source of truth is the permission itself, never a list in storage: a reader can revoke
 * a site from about:addons without ever opening our interface, and a list would then be a
 * confident lie.
 */
import { isApiOrigin } from './origin'
import type { Request } from './messages'

/** Granted origins that are actual sites, i.e. everything except our own API hosts. */
export async function enabledSites(): Promise<string[]> {
  const granted = await browser.permissions.getAll()
  return (granted.origins ?? []).filter((pattern) => !isApiOrigin(pattern)).sort()
}

export async function isEnabled(pattern: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [pattern] })
}

/**
 * Tells the scripts already running on a site to stop, so switching it off takes effect
 * without a reload. Must be called *before* the permission is dropped: afterwards we can no
 * longer reach those tabs.
 */
export async function stopScriptsOn(pattern: string, alsoTabId?: number): Promise<void> {
  const targets = new Set<number>()
  if (alsoTabId !== undefined) targets.add(alsoTabId)

  try {
    for (const tab of await browser.tabs.query({ url: pattern })) {
      if (tab.id !== undefined) targets.add(tab.id)
    }
  } catch {
    // Without the URL filter we can still reach whatever tab the caller knew about.
  }

  const stop: Request = { type: 'content-stop' }
  await Promise.all(
    [...targets].map((id) =>
      browser.tabs.sendMessage(id, stop).catch(() => {
        // No script in that tab, or it never loaded. Nothing to stop.
      }),
    ),
  )
}

/** Switches a site off: stops what is running, then gives the permission back. */
export async function disableSite(pattern: string, alsoTabId?: number): Promise<void> {
  await stopScriptsOn(pattern, alsoTabId)
  await browser.permissions.remove({ origins: [pattern] })
}
