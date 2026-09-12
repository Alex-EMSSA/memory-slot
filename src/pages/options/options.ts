/**
 * Settings page.
 *
 * Everything saves as it changes — there is no Save button, because a settings page with
 * four controls does not need one, and an unsaved change is a bug waiting to happen.
 */
import { readableTextColour } from '../../lib/colour'
import { LANGUAGES } from '../../lib/langs'
import { hostFromPattern } from '../../lib/origin'
import { disableSite, enabledSites } from '../../lib/sites'
import { getSettings, patchSettings, type Settings } from '../../lib/store/settings'

/** TODO: replace with the real donation link before the first AMO submission. */
const SUPPORT_URL = 'https://ko-fi.com/'

/** Offered when the user turns the colour on without having picked one before. */
const DEFAULT_COLOUR = '#4f46e5'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`options: #${id} is missing`)
  return node as T
}

function fillLanguages(select: HTMLSelectElement, withAuto: boolean): void {
  if (withAuto) {
    const auto = document.createElement('option')
    auto.value = 'auto'
    auto.textContent = 'Detect automatically'
    select.append(auto)
  }

  for (const language of LANGUAGES) {
    const option = document.createElement('option')
    option.value = language.code
    option.textContent = language.name
    select.append(option)
  }
}

/** An empty or nonsensical box must not silently become zero cards a day. */
function count(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value)
  const clean = Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
  input.value = String(clean)
  return clean
}

/**
 * Listed from the permissions themselves rather than from a list we keep: a reader can revoke
 * a site in about:addons, and a remembered list would then show sites that are already off.
 */
async function renderSites(): Promise<void> {
  const list = el('sites')
  const sites = await enabledSites()

  el('sites-empty').hidden = sites.length > 0
  list.replaceChildren(...sites.map(renderSite))
}

function renderSite(pattern: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'site'

  const host = document.createElement('span')
  host.className = 'site__host'
  host.textContent = hostFromPattern(pattern)

  const off = document.createElement('button')
  off.className = 'button'
  off.type = 'button'
  off.textContent = 'Switch off'
  off.setAttribute('aria-label', `Switch off ${hostFromPattern(pattern)}`)
  off.addEventListener('click', () => {
    off.disabled = true
    void disableSite(pattern).then(renderSites)
  })

  item.append(host, off)
  return item
}

let savedTimer: number | undefined

function flashSaved(): void {
  const node = el('saved')
  node.hidden = false
  if (savedTimer !== undefined) clearTimeout(savedTimer)
  savedTimer = window.setTimeout(() => {
    node.hidden = true
  }, 1200)
}

async function save(patch: Partial<Settings>): Promise<void> {
  await patchSettings(patch)
  flashSaved()
}

/** Shows what the tooltip will actually look like, including the derived text colour. */
function renderPreview(colour: string): void {
  const box = el('preview-box')
  const note = el('preview-note')

  if (colour === '') {
    box.style.removeProperty('background')
    box.style.removeProperty('color')
    box.style.removeProperty('border-color')
    note.textContent = 'Following your system light and dark theme.'
    return
  }

  box.style.setProperty('background', colour)
  box.style.setProperty('color', readableTextColour(colour))
  box.style.setProperty('border-color', 'transparent')
  note.textContent = 'Your colour, with the text colour chosen to stay readable on it.'
}

async function init(): Promise<void> {
  el('version').textContent = `v${browser.runtime.getManifest().version}`

  const targetLang = el<HTMLSelectElement>('target-lang')
  const sourceLang = el<HTMLSelectElement>('source-lang')
  const colour = el<HTMLInputElement>('tooltip-colour')

  fillLanguages(targetLang, false)
  fillLanguages(sourceLang, true)

  const settings = await getSettings()
  targetLang.value = settings.targetLang
  sourceLang.value = settings.sourceLang
  if (settings.tooltipColour !== '') colour.value = settings.tooltipColour
  renderPreview(settings.tooltipColour)

  // A target language we do not offer would leave the select on its first entry and
  // silently change what the user had. Adding it keeps their choice intact.
  if (targetLang.value !== settings.targetLang) {
    const custom = document.createElement('option')
    custom.value = settings.targetLang
    custom.textContent = settings.targetLang
    targetLang.append(custom)
    targetLang.value = settings.targetLang
  }

  const newPerDay = el<HTMLInputElement>('new-per-day')
  const reviewsPerDay = el<HTMLInputElement>('reviews-per-day')
  newPerDay.value = String(settings.newPerDay)
  reviewsPerDay.value = String(settings.reviewsPerDay)

  newPerDay.addEventListener('change', () => void save({ newPerDay: count(newPerDay, 20) }))
  reviewsPerDay.addEventListener(
    'change',
    () => void save({ reviewsPerDay: count(reviewsPerDay, 200) }),
  )

  targetLang.addEventListener('change', () => void save({ targetLang: targetLang.value }))
  sourceLang.addEventListener('change', () => void save({ sourceLang: sourceLang.value }))

  colour.addEventListener('input', () => renderPreview(colour.value))
  colour.addEventListener('change', () => void save({ tooltipColour: colour.value }))

  el('colour-auto').addEventListener('click', () => {
    colour.value = DEFAULT_COLOUR
    renderPreview('')
    void save({ tooltipColour: '' })
  })

  await renderSites()
  // The list must follow the toolbar switch, not just this page's own buttons.
  browser.permissions.onAdded.addListener(() => void renderSites())
  browser.permissions.onRemoved.addListener(() => void renderSites())

  el<HTMLAnchorElement>('cards').addEventListener('click', (event) => {
    event.preventDefault()
    void browser.tabs.create({ url: browser.runtime.getURL('manager.html') })
  })

  el<HTMLAnchorElement>('support').addEventListener('click', (event) => {
    event.preventDefault()
    void browser.tabs.create({ url: SUPPORT_URL })
  })
}

void init()
