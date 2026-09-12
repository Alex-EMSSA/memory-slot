/**
 * Toolbar popup — the on/off switch for the current site.
 *
 * The permission request has to happen here rather than in the background page: Firefox
 * only accepts permissions.request() from a user input handler on an extension page, and
 * it must be the first thing the handler does. Anything awaited before it loses the gesture.
 */
import { ICON_OFF, TITLE_OFF } from '../../lib/icons'
import type { Request } from '../../lib/messages'
import { siteTarget, type SiteTarget } from '../../lib/origin'

/** TODO: replace with the real donation link before the first AMO submission. */
const SUPPORT_URL = 'https://ko-fi.com/'

const CONTENT_SCRIPT_FILE = 'content.js'

type Page = { tabId: number; target: SiteTarget | null }

/** Resolved once while the popup opens, so the toggle handler never has to await first. */
let page: Page = { tabId: -1, target: null }

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`popup: #${id} is missing`)
  return node as T
}

const toggle = () => el<HTMLInputElement>('site-toggle')

function setHint(text: string): void {
  el('hint').textContent = text
}

/**
 * activeTab gives us the URL of the tab the user is looking at for as long as this popup
 * is open. That is the whole reason we need no "tabs" permission.
 */
async function currentPage(): Promise<Page> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return { tabId: tab?.id ?? -1, target: siteTarget(tab?.url) }
}

async function enable(target: SiteTarget, tabId: number): Promise<void> {
  // First statement of the gesture: no await may precede it.
  const granted = await browser.permissions.request({ origins: [target.pattern] })
  if (!granted) {
    toggle().checked = false
    setHint('Not enabled: Firefox did not grant access to this site.')
    return
  }

  // A registered script only starts on the next navigation, so the open tab is injected now.
  try {
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [CONTENT_SCRIPT_FILE],
    })
  } catch {
    setHint(`On for ${target.host}. Reload the page to start using it here.`)
    return
  }

  setHint(`On for ${target.host}. Double-click a word to translate it.`)
}

async function disable(target: SiteTarget, tabId: number): Promise<void> {
  // Order matters: the running scripts are told to stop while we still hold the permission
  // that lets us reach their tabs.
  await stopRunningScripts(target.pattern, tabId)
  await browser.permissions.remove({ origins: [target.pattern] })

  try {
    await browser.action.setIcon({ tabId, path: ICON_OFF })
    await browser.action.setTitle({ tabId, title: TITLE_OFF })
  } catch {
    // Cosmetic only.
  }

  setHint(`Off for ${target.host}. Nothing on this site is read any more.`)
}

async function stopRunningScripts(pattern: string, tabId: number): Promise<void> {
  const targets = new Set<number>([tabId])

  try {
    for (const tab of await browser.tabs.query({ url: pattern })) {
      if (tab.id !== undefined) targets.add(tab.id)
    }
  } catch {
    // Without the URL filter we can still reach the tab the user is looking at.
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

async function init(): Promise<void> {
  el('version').textContent = `v${browser.runtime.getManifest().version}`

  el<HTMLAnchorElement>('support').addEventListener('click', (event) => {
    event.preventDefault()
    void browser.tabs.create({ url: SUPPORT_URL })
  })

  el<HTMLAnchorElement>('options').addEventListener('click', (event) => {
    event.preventDefault()
    // M6 registers options_ui; until then there is nothing to open.
  })

  page = await currentPage()

  if (!page.target) {
    el('host').textContent = 'not a web page'
    setHint('Memory Slot works on ordinary web pages only.')
    return
  }

  el('host').textContent = page.target.host

  const enabled = await browser.permissions.contains({ origins: [page.target.pattern] })
  const input = toggle()
  input.checked = enabled
  input.disabled = false
  setHint(
    enabled
      ? `On for ${page.target.host}. Double-click a word to translate it.`
      : `Off. Memory Slot reads nothing on ${page.target.host} until you turn it on.`,
  )

  input.addEventListener('change', () => {
    const { target, tabId } = page
    if (!target) return

    // No await before the branch: permissions.request() must run inside this gesture.
    if (input.checked) void enable(target, tabId)
    else void disable(target, tabId)
  })
}

void init()
