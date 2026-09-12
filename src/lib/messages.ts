/**
 * Message contract between the popup / content scripts and the background page.
 * Every cross-context call goes through browser.runtime.sendMessage with one of these shapes.
 */

export type Request =
  /** Content script or popup asks the background page for a translation. */
  | { type: 'translate'; text: string; from?: string; to?: string }
  /** Content script announces itself so the background can light up the toolbar icon. */
  | { type: 'content-ready' }
  /** Sent to a tab when its site is switched off, so the script stops without a reload. */
  | { type: 'content-stop' }
  /** Diagnostics: is our script alive in this tab? */
  | { type: 'ping' }
  /** Save the current card. Storage lives in the background: see lib/store/db.ts. */
  | {
      type: 'add-card'
      front: string
      back: string
      langFrom: string
      langTo: string
      context?: string
      sourceUrl?: string
      sourceTitle?: string
    }
  /** Undo a save, putting back exactly what was there before. */
  | { type: 'restore-card'; id: string; previous: unknown }
  /** How many cards are waiting to be reviewed. */
  | { type: 'due-count' }

export type Response<T = unknown> = { ok: true; data: T } | { ok: false; error: ErrorCode }

export type ErrorCode =
  | 'not-implemented'
  | 'network'
  | 'rate-limited'
  | 'provider-failed'
  | 'permission-denied'
  | 'bad-request'

export function ok<T>(data: T): Response<T> {
  return { ok: true, data }
}

export function fail(error: ErrorCode): Response<never> {
  return { ok: false, error }
}

/** Typed wrapper so callers never hand-roll sendMessage payloads. */
export async function send<T = unknown>(request: Request): Promise<Response<T>> {
  return (await browser.runtime.sendMessage(request)) as Response<T>
}
