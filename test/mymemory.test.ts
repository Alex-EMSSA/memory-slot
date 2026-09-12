import { describe, expect, it } from 'vitest'
import { parseMyMemoryResponse } from '../src/lib/providers/mymemory'
import { ProviderError } from '../src/lib/providers/types'

function reply(translatedText: unknown, extra: Record<string, unknown> = {}): unknown {
  return { responseData: { translatedText }, responseStatus: 200, ...extra }
}

describe('parseMyMemoryResponse', () => {
  it('reads the translation', () => {
    expect(parseMyMemoryResponse(reply('привіт')).text).toBe('привіт')
  })

  it('decodes the entities the API escapes even in plain text', () => {
    expect(parseMyMemoryResponse(reply('don&#39;t')).text).toBe("don't")
  })

  /** The refusal arrives as a perfectly successful 200 with the complaint in the text. */
  it('recognises the daily allowance running out', () => {
    const warning =
      'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN 12 HOURS'

    try {
      parseMyMemoryResponse(reply(warning))
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as ProviderError).code).toBe('rate-limited')
    }
  })

  it('reports a non-200 response status from the body', () => {
    try {
      parseMyMemoryResponse(reply('anything', { responseStatus: 403, responseDetails: 'NO PAIR' }))
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as ProviderError).code).toBe('provider-failed')
      expect((error as ProviderError).message).toContain('NO PAIR')
    }
  })

  it('rejects an empty translation instead of caching nothing', () => {
    expect(() => parseMyMemoryResponse(reply('   '))).toThrow(ProviderError)
    expect(() => parseMyMemoryResponse(reply(undefined))).toThrow(ProviderError)
  })

  it('rejects a response of the wrong shape', () => {
    expect(() => parseMyMemoryResponse(null)).toThrow(ProviderError)
    expect(() => parseMyMemoryResponse('a string')).toThrow(ProviderError)
  })
})
