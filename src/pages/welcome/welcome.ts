/**
 * Shown once, right after installation.
 *
 * It exists because of the single biggest risk in this design: the reader installs the
 * extension, double-clicks a word, nothing happens, and they conclude it is broken. It has to
 * say "you switch it on per site" before they find that out the hard way.
 */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`welcome: #${id} is missing`)
  return node as T
}

function openSettings(): void {
  void browser.runtime.openOptionsPage()
}

function openCards(): void {
  void browser.tabs.create({ url: browser.runtime.getURL('manager.html') })
}

function init(): void {
  el('settings').addEventListener('click', openSettings)
  el('cards-link').addEventListener('click', (event) => {
    event.preventDefault()
    openCards()
  })
  el('settings-link').addEventListener('click', (event) => {
    event.preventDefault()
    openSettings()
  })

  el('close').addEventListener('click', () => {
    // Closing our own tab needs no permission, and leaves the reader where they were.
    window.close()
  })
}

init()
