/**
 * Hits the real MyMemory API. Run on demand with `npm run test:live`, never in CI.
 *
 * This is the test that catches what fixtures cannot: the response shape changing, or the
 * free allowance being gone, which arrives as a perfectly successful 200.
 */
import { describe, expect, it } from 'vitest'
import { parseMyMemoryResponse } from '../../src/lib/providers/mymemory'

async function ask(text: string, langpair: string): Promise<unknown> {
  const params = new URLSearchParams({ q: text, langpair })
  const response = await fetch(`https://api.mymemory.translated.net/get?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  expect(response.ok).toBe(true)
  return response.json()
}

describe('mymemory against the live API', () => {
  it('translates a word', async () => {
    const result = parseMyMemoryResponse(await ask('hello', 'en|uk'))

    console.info('  hello ->', result.text)
    expect(result.text.length).toBeGreaterThan(0)
    expect(result.text.toLowerCase()).not.toBe('hello')
  })

  it('translates a sentence', async () => {
    const result = parseMyMemoryResponse(await ask('The weather is good today.', 'en|ru'))

    console.info('  sentence ->', result.text)
    expect(result.text.length).toBeGreaterThan(10)
  })

  it('still returns the shape we parse when the pair is unusual', async () => {
    const raw = await ask('hello', 'en|es')
    expect(raw).toHaveProperty('responseData')
    expect(raw).toHaveProperty('responseStatus')
  })
})
