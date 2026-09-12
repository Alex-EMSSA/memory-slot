/**
 * User settings, kept in storage.local. The full options page lands in M6; this is the
 * slice the translation core needs.
 */

export type Settings = {
  /** BCP-47 code the user is learning into. */
  targetLang: string
  /** 'auto' or a fixed BCP-47 code. */
  sourceLang: string
  /** Optional Google Cloud Translation key. Empty means "use the free endpoint". */
  apiKey: string
}

const STORAGE_KEY = 'settings.v1'

/** Guessing from the browser UI language beats making everyone open the options page. */
function defaultTargetLang(): string {
  try {
    const uiLanguage = browser.i18n.getUILanguage()
    const primary = uiLanguage.split('-')[0]
    if (primary) return primary
  } catch {
    // i18n is unavailable in tests and in some contexts; the fallback below is fine.
  }
  return 'en'
}

export function defaultSettings(): Settings {
  return { targetLang: defaultTargetLang(), sourceLang: 'auto', apiKey: '' }
}

export async function getSettings(): Promise<Settings> {
  const defaults = defaultSettings()
  try {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
    if (stored && typeof stored === 'object') {
      return { ...defaults, ...(stored as Partial<Settings>) }
    }
  } catch {
    // Fall through to defaults: the extension must stay usable with a broken store.
  }
  return defaults
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await browser.storage.local.set({ [STORAGE_KEY]: next })
  return next
}
