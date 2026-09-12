import type { ErrorCode } from '../messages'

export type TranslateRequest = {
  text: string
  /** BCP-47 code, or 'auto' to let the provider detect it. */
  from: string
  to: string
}

export type TranslateResult = {
  text: string
  /** What the provider believes the source language was. Absent when it does not say. */
  detectedFrom?: string
  /** Dictionary senses for single words; empty for sentences. */
  alternatives?: string[]
}

/** Every provider failure is normalised into this, so callers never inspect HTTP details. */
export class ProviderError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export interface TranslationProvider {
  readonly id: string
  translate(request: TranslateRequest, signal?: AbortSignal): Promise<TranslateResult>
}

export function asProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error
  return new ProviderError('provider-failed', String(error), error)
}
