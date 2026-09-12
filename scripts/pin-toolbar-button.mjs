/**
 * Pins our toolbar button in the dev profile.
 *
 * Firefox files new extension buttons into the hidden "unified extensions" menu, which during
 * development mostly means staring at a toolbar wondering whether the extension loaded at all.
 * This moves the button onto the visible toolbar once, before Firefox starts.
 *
 * No-op when the profile does not exist yet, when the pref has not been written yet (Firefox
 * writes prefs.js on exit, so the very first run has nothing to patch), or when it is already
 * pinned. Never run while Firefox is open: it rewrites prefs.js on exit and would undo this.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const PREF_KEY = 'browser.uiCustomization.state'

/** Same transformation Firefox applies to build a widget id from an extension id. */
function widgetId(extensionId) {
  return `${extensionId.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-browser-action`
}

export function pinToolbarButton(profileDir, manifestPath = 'src/manifest.json') {
  const prefsPath = `${profileDir}/prefs.js`
  if (!existsSync(prefsPath)) return 'no profile yet'

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const widget = widgetId(manifest.browser_specific_settings.gecko.id)

  const text = readFileSync(prefsPath, 'utf8')
  const lines = text.split(/\r?\n/)
  const index = lines.findIndex((line) => line.startsWith(`user_pref("${PREF_KEY}"`))
  if (index === -1) return 'pref not written yet'

  const literal = lines[index].slice(`user_pref("${PREF_KEY}", `.length, -2)
  let state
  try {
    state = JSON.parse(JSON.parse(literal))
  } catch {
    return 'pref unreadable'
  }

  const places = state.placements ?? {}
  const navbar = places['nav-bar']
  if (!Array.isArray(navbar)) return 'no nav-bar in profile'
  if (navbar.includes(widget)) return 'already pinned'

  for (const area of Object.keys(places)) {
    places[area] = places[area].filter((id) => id !== widget)
  }

  const anchor = navbar.indexOf('unified-extensions-button')
  navbar.splice(anchor === -1 ? navbar.length : anchor, 0, widget)

  if (!state.seen?.includes(widget)) (state.seen ??= []).push(widget)
  // Without this Firefox treats the areas as pristine and re-applies its own default placement.
  state.dirtyAreaCache = [
    ...new Set([...(state.dirtyAreaCache ?? []), 'nav-bar', 'unified-extensions-area']),
  ]

  copyFileSync(prefsPath, `${prefsPath}.bak`)
  lines[index] = `user_pref("${PREF_KEY}", ${JSON.stringify(JSON.stringify(state))});`
  writeFileSync(prefsPath, lines.join('\n'), 'utf8')

  return 'pinned'
}
