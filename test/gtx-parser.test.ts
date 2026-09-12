/**
 * Fixtures are shaped like real responses from translate_a/single. When Google changes the
 * format these tests are the tripwire, and this file is the only thing that needs fixing.
 */
import { describe, expect, it } from 'vitest'
import { parseGtxResponse } from '../src/lib/providers/google-gtx'
import { ProviderError } from '../src/lib/providers/types'

const SINGLE_WORD = [
  [['привіт', 'hello', null, null, 10]],
  [['вигук', ['привіт', 'алло', 'здоров', 'привіт'], [['привіт', ['hello'], null, 0.9]], 'hello', 9]],
  'en',
  null,
  null,
  null,
  1,
  [],
  [['en'], null, [1], ['en']],
]

const TWO_CHUNKS = [
  [
    ['Перше речення. ', 'First sentence. ', null, null, 3],
    ['Друге речення.', 'Second sentence.', null, null, 3],
  ],
  null,
  'en',
]

describe('parseGtxResponse', () => {
  it('reads the translation and the detected language', () => {
    const result = parseGtxResponse(SINGLE_WORD)
    expect(result.text).toBe('привіт')
    expect(result.detectedFrom).toBe('en')
  })

  it('collects dictionary senses, deduplicated', () => {
    expect(parseGtxResponse(SINGLE_WORD).alternatives).toEqual(['привіт', 'алло', 'здоров'])
  })

  it('concatenates chunks in order, keeping the spacing', () => {
    expect(parseGtxResponse(TWO_CHUNKS).text).toBe('Перше речення. Друге речення.')
  })

  it('omits alternatives when there is no dictionary section', () => {
    expect(parseGtxResponse(TWO_CHUNKS).alternatives).toBeUndefined()
  })

  it('survives chunks that are not the expected shape', () => {
    const noisy = [[['ок', 'ok'], null, 'garbage', ['ей', 'hey']], null, 'en']
    expect(parseGtxResponse(noisy).text).toBe('окей')
  })

  it('rejects a response that is not an array', () => {
    expect(() => parseGtxResponse({ error: 'blocked' })).toThrow(ProviderError)
  })

  it('rejects an empty translation instead of caching nothing', () => {
    expect(() => parseGtxResponse([[['   ', 'hello']], null, 'en'])).toThrow(/empty translation/)
  })

  it('reports a missing translation section as a provider failure', () => {
    try {
      parseGtxResponse([null, null, 'en'])
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as ProviderError).code).toBe('provider-failed')
    }
  })
})
