/**
 * Toolbar popup — the on/off switch for the current site.
 *
 * The permission request has to happen here rather than in the background page: Firefox
 * only accepts permissions.request() from a user input handler on an extension page, and
 * it must be the first thing the handler does. Anything awaited before it loses the gesture.
 */
import { setToolbarState } from '../../lib/toolbar'
import { send, type Request } from '../../lib/messages'
import { siteTarget, type SiteTarget } from '../../lib/origin'

/** TODO: replace with the real donation link before the first AMO submission. */
const SUPPORT_URL = 'https://ko-fi.com/'

const CONTENT_SCRIPT_FILE = 'content.js'

type Page = { tabId: number; url: string; target: SiteTarget | null }

/** Resolved while the popup opens, so the toggle handler never has to await first. */
let page: Page = { tabId: -1, url: '', target: null }

/** Result of the last injection attempt, shown in the diagnostics line. */
let lastInjection = 'not attempted'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`popup: #${id} is missing`)
  return node as T
}

const toggle = () => el<HTMLInputElement>('site-toggle')

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Asks the page directly instead of assuming: the only honest answer about a running script. */
async function isScriptAlive(tabId: number): Promise<boolean> {
  try {
    const ping: Request = { type: 'ping' }
    return Boolean(await browser.tabs.sendMessage(tabId, ping))
  } catch {
    return false
  }
}

/**
 * activeTab gives us the URL of the tab the user is looking at for as long as this popup
 * is open. That is the whole reason we need no "tabs" permission.
 */
async function currentPage(): Promise<Page> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return { tabId: tab?.id ?? -1, url: tab?.url ?? '', target: siteTarget(tab?.url) }
}

/**
 * Only genuine failures are shown. Everything else belongs in the hint, in plain words.
 * These strings come from the browser or from Google, so they are reported verbatim
 * rather than guessed at.
 */
async function showProblems(badge: string): Promise<void> {
  const problems: string[] = []
  if (badge !== 'ok' && badge !== 'skipped') problems.push(`toolbar: ${badge}`)
  if (lastInjection !== 'ok' && lastInjection !== 'not attempted') {
    problems.push(`could not start on this page: ${lastInjection}`)
  }

  const recorded = await lastRecordedProblem()
  if (recorded !== '') problems.push(recorded)

  const node = el('diag')
  node.textContent = problems.join(' · ')
  node.hidden = problems.length === 0
}

/** The background page records what failed; its own console is gone once it unloads. */
async function lastRecordedProblem(): Promise<string> {
  try {
    const stored = (await browser.storage.local.get('diag.v1'))['diag.v1'] as
      | Record<string, unknown>
      | undefined
    if (!stored) return ''
    return Object.entries(stored)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ')
  } catch {
    return ''
  }
}

/** Renders the whole popup from the real state of the page. Safe to call at any time. */
async function refresh(): Promise<void> {
  page = await currentPage()
  const input = toggle()

  if (!page.target) {
    el('host').textContent = 'not a web page'
    el('hint').textContent = 'Memory Slot works on ordinary web pages only.'
    await showProblems('skipped')
    input.checked = false
    input.disabled = true
    return
  }

  el('host').textContent = page.target.host

  const granted = await browser.permissions.contains({ origins: [page.target.pattern] })
  input.checked = granted
  input.disabled = false

  const alive = granted ? await isScriptAlive(page.tabId) : false
  const badge = granted ? await setToolbarState(page.tabId, alive) : 'skipped'

  if (!granted) {
    el('hint').textContent =
      `Off. Memory Slot reads nothing on ${page.target.host} until you turn it on.`
  } else if (alive) {
    el('hint').textContent = `On for ${page.target.host}. Double-click a word to translate it.`
  } else {
    el('hint').textContent = `On for ${page.target.host}. Reload this page to start using it here.`
  }

  await showProblems(badge)
}

async function enable(target: SiteTarget, tabId: number): Promise<void> {
  // First statement of the gesture: no await may precede it.
  const granted = await browser.permissions.request({ origins: [target.pattern] })
  if (!granted) {
    lastInjection = 'permission refused'
    await refresh()
    return
  }

  // A registered script only starts on the next navigation, so the open tab is injected now.
  try {
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [CONTENT_SCRIPT_FILE],
    })
    lastInjection = 'ok'
  } catch (error) {
    lastInjection = describe(error)
  }

  await refresh()
}

async function disable(target: SiteTarget, tabId: number): Promise<void> {
  // Order matters: the running scripts are told to stop while we still hold the permission
  // that lets us reach their tabs.
  await stopRunningScripts(target.pattern, tabId)
  await browser.permissions.remove({ origins: [target.pattern] })
  await setToolbarState(tabId, false)

  lastInjection = 'not attempted'
  await refresh()
  el('hint').textContent = `Off for ${target.host}. Nothing on this site is read any more.`
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

/** The count in the popup has to be the real one; a hard-coded zero is a lie with a number on it. */
async function showDueCount(): Promise<void> {
  const response = await send<{ due: number }>({ type: 'due-count' })
  el('due-count').textContent = String(response.ok ? response.data.due : 0)
}

async function init(): Promise<void> {
  el('version').textContent = `v${browser.runtime.getManifest().version}`
  void showDueCount()

  el<HTMLAnchorElement>('support').addEventListener('click', (event) => {
    event.preventDefault()
    void browser.tabs.create({ url: SUPPORT_URL })
  })

  el<HTMLAnchorElement>('options').addEventListener('click', (event) => {
    event.preventDefault()
    void browser.runtime.openOptionsPage()
  })

  toggle().addEventListener('change', () => {
    const input = toggle()
    const { target, tabId } = page
    if (!target) return

    // No await before the branch: permissions.request() must run inside this gesture.
    if (input.checked) void enable(target, tabId)
    else void disable(target, tabId)
  })

  await refresh()
}

// A popup that fails silently is a popup that cannot be debugged.
void init().catch((error: unknown) => {
  const diag = document.getElementById('diag')
  if (diag) diag.textContent = `popup failed: ${describe(error)}`
})
