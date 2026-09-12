/**
 * Toolbar popup.
 *
 * In M2 this becomes the on/off switch for the current site: the toggle calls
 * permissions.request() from inside this click handler, which is the only place
 * Firefox accepts such a request. For now it only reports where we are.
 */

/** TODO: replace with the real donation link before the first AMO submission. */
const SUPPORT_URL = 'https://ko-fi.com/'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`popup: #${id} is missing`)
  return node as T
}

/**
 * The active tab's URL is only readable once we hold a host permission for it,
 * so an unknown host here is a normal state, not an error.
 */
async function currentHost(): Promise<string> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return 'this page'
  try {
    return new URL(tab.url).hostname || 'this page'
  } catch {
    return 'this page'
  }
}

async function init(): Promise<void> {
  el('version').textContent = `v${browser.runtime.getManifest().version}`
  el('host').textContent = await currentHost()

  el<HTMLAnchorElement>('support').addEventListener('click', (event) => {
    event.preventDefault()
    void browser.tabs.create({ url: SUPPORT_URL })
  })

  el<HTMLAnchorElement>('options').addEventListener('click', (event) => {
    event.preventDefault()
    // M6 registers options_ui; until then there is nothing to open.
  })
}

void init()
