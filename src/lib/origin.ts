/**
 * Turning a tab URL into the match pattern we ask permission for.
 *
 * Granularity is the origin: "enabled on reddit.com" covers the whole site. Per-path rules
 * would be a settings screen nobody wants and a permission prompt nobody understands.
 */

export type SiteTarget = {
  /** Match pattern for permissions and content script registration. */
  pattern: string
  /** What the user sees, e.g. "en.wikipedia.org". */
  host: string
}

/** Pages where an extension either cannot run or must not: the toggle stays off there. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function siteTarget(url: string | undefined): SiteTarget | null {
  if (!url) return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null
  if (parsed.hostname === '') return null

  return {
    pattern: `${parsed.protocol}//${parsed.hostname}/*`,
    host: parsed.hostname,
  }
}

/** Hosts we talk to ourselves. They are never sites the user "enables". */
export const API_ORIGINS: readonly string[] = [
  'https://translate.googleapis.com/*',
  'https://translation.googleapis.com/*',
  'https://api.mymemory.translated.net/*',
]

export function isApiOrigin(pattern: string): boolean {
  return API_ORIGINS.includes(pattern)
}
