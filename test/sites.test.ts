import { describe, expect, it, vi } from 'vitest'
import { hostFromPattern } from '../src/lib/origin'
import { installBrowserStub } from './helpers/browser-stub'

const API_ORIGINS = [
  'https://translate.googleapis.com/*',
  'https://translation.googleapis.com/*',
  'https://api.mymemory.translated.net/*',
]

async function freshSites(origins: string[] = []) {
  vi.resetModules()
  const stub = installBrowserStub({}, [...API_ORIGINS, ...origins])
  const module = await import('../src/lib/sites')
  return { ...module, stub }
}

describe('hostFromPattern', () => {
  it('shows the reader a host, not a match pattern', () => {
    expect(hostFromPattern('https://en.wikipedia.org/*')).toBe('en.wikipedia.org')
    expect(hostFromPattern('http://localhost/*')).toBe('localhost')
  })
})

describe('enabledSites', () => {
  it('is empty when only our own endpoints are granted', async () => {
    const sites = await freshSites()
    expect(await sites.enabledSites()).toEqual([])
  })

  /** The API hosts are ours; listing them as "sites you enabled" would be a lie. */
  it('never lists the translation endpoints', async () => {
    const sites = await freshSites(['https://example.com/*'])
    expect(await sites.enabledSites()).toEqual(['https://example.com/*'])
  })

  it('sorts, so the list does not reshuffle itself between visits', async () => {
    const sites = await freshSites(['https://z.com/*', 'https://a.com/*'])
    expect(await sites.enabledSites()).toEqual(['https://a.com/*', 'https://z.com/*'])
  })
})

describe('isEnabled', () => {
  it('answers from the permission, which is the only source of truth', async () => {
    const sites = await freshSites(['https://example.com/*'])

    expect(await sites.isEnabled('https://example.com/*')).toBe(true)
    expect(await sites.isEnabled('https://other.com/*')).toBe(false)
  })
})

describe('disableSite', () => {
  it('gives the permission back', async () => {
    const sites = await freshSites(['https://example.com/*'])
    await sites.disableSite('https://example.com/*')

    expect(await sites.enabledSites()).toEqual([])
    expect(sites.stub.origins.has('https://example.com/*')).toBe(false)
  })

  it('leaves the other sites alone', async () => {
    const sites = await freshSites(['https://example.com/*', 'https://other.com/*'])
    await sites.disableSite('https://example.com/*')

    expect(await sites.enabledSites()).toEqual(['https://other.com/*'])
  })

  it('does not take our own endpoints down with it', async () => {
    const sites = await freshSites(['https://example.com/*'])
    await sites.disableSite('https://example.com/*')

    for (const api of API_ORIGINS) expect(sites.stub.origins.has(api)).toBe(true)
  })
})
