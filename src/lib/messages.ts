/**
 * Message contract between the popup / content scripts and the background page.
 * Every cross-context call goes through browser.runtime.sendMessage with one of these shapes.
 */

export type Request =
  /** Ask the background page for a translation. Added in M1. */
  | { type: 'translate'; text: string; from: string; to: string }
  /** Is the extension enabled on this origin? Added in M2. */
  | { type: 'site-status'; origin: string }
  /** Turn the extension on or off for an origin. Added in M2. */
  | { type: 'site-toggle'; origin: string; enabled: boolean }

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
