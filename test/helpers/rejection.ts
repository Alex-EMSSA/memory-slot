import type { ProviderError } from '../../src/lib/providers/types'

/**
 * Awaits a call that is expected to fail and hands back the typed error.
 * A plain .catch() would leave the value typed as "result or error", which defeats
 * asserting on error.code.
 */
export async function rejection(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason as ProviderError,
  )
  if (!error) throw new Error('expected the call to fail, but it resolved')
  return error
}
