/**
 * Hits the real Bing translator. Run on demand with `npm run test:live`, never in CI.
 *
 * This is the provider whose credentials are read off a live web page, so this test is not a
 * nicety: it is the only thing that will notice when Microsoft changes that page.
 */
import { describe, expect, it } from 'vitest'
import { parseBingCredentials, parseBingResponse } from '../../src/lib/providers/bing'

/**
 * Bing answers 401 to anything that does not look like a browser, and Node introduces itself
 * as undici. Inside the extension this is free: Firefox sends its own User-Agent, which is
 * exactly why the provider sets no headers of its own.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0'

async function credentials() {
  const response = await fetch('https://www.bing.com/translator', {
    headers: { Accept: 'text/html', 'User-Agent': BROWSER_UA },
  })
  expect(response.ok).toBe(true)
  return parseBingCredentials(await response.text())
}

describe('bing against the live endpoint', () => {
  it('still carries its credentials where we look for them', async () => {
    const auth = await credentials()

    console.info('  ig:', auth.ig, '| iid:', auth.iid, '| token length:', auth.token.length)
    expect(auth.ig.length).toBeGreaterThan(8)
    expect(auth.token.length).toBeGreaterThan(8)
    expect(auth.key).toMatch(/^\d+$/)
  })

  it('translates a word', async () => {
    const auth = await credentials()

    const body = new URLSearchParams({
      fromLang: 'auto-detect',
      to: 'uk',
      text: 'hello',
      token: auth.token,
      key: auth.key,
    })

    const response = await fetch(
      `https://www.bing.com/ttranslatev3?isVertical=1&IG=${auth.ig}&IID=${auth.iid}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': BROWSER_UA,
        },
        body: body.toString(),
      },
    )

    const result = parseBingResponse(await response.json())
    console.info('  hello ->', result.text, '| detected:', result.detectedFrom)

    expect(result.text.toLowerCase()).toContain('привіт')
    expect(result.detectedFrom).toBe('en')
  })
})
