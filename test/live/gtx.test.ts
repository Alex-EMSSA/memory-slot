/**
 * Hits the real Google endpoint. Run on demand with `npm run test:live`, never in CI.
 *
 * This is the test that catches the failure the fixture tests cannot: Google silently
 * changing the response shape, or starting to refuse us outright.
 */
import { describe, expect, it } from 'vitest'
import { googleGtx } from '../../src/lib/providers/google-gtx'

describe('google gtx against the live endpoint', () => {
  it('translates a word and detects the source language', async () => {
    const result = await googleGtx.translate({ text: 'hello', from: 'auto', to: 'uk' })

    console.info('  hello ->', result.text, '| detected:', result.detectedFrom)
    expect(result.text.toLowerCase()).toContain('привіт')
    expect(result.detectedFrom).toBe('en')
  })

  it('returns dictionary senses for a single word', async () => {
    const result = await googleGtx.translate({ text: 'bright', from: 'en', to: 'uk' })

    console.info('  bright ->', result.text, '| senses:', result.alternatives?.join(', '))
    expect(result.alternatives?.length).toBeGreaterThan(1)
  })

  it('translates a sentence in one piece', async () => {
    const result = await googleGtx.translate({
      text: 'The quick brown fox jumps over the lazy dog.',
      from: 'en',
      to: 'uk',
    })

    console.info('  sentence ->', result.text)
    expect(result.text.length).toBeGreaterThan(20)
    expect(result.text).not.toContain('quick')
  })
})
