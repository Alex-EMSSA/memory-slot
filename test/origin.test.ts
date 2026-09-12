import { describe, expect, it } from 'vitest'
import { isApiOrigin, siteTarget } from '../src/lib/origin'

describe('siteTarget', () => {
  it('turns a page URL into an origin-wide match pattern', () => {
    expect(siteTarget('https://en.wikipedia.org/wiki/Firefox')).toEqual({
      pattern: 'https://en.wikipedia.org/*',
      host: 'en.wikipedia.org',
    })
  })

  it('ignores the path, query and fragment', () => {
    expect(siteTarget('https://example.com/a/b?c=d#e')?.pattern).toBe('https://example.com/*')
  })

  it('keeps the scheme, so http and https are separate grants', () => {
    expect(siteTarget('http://example.com/')?.pattern).toBe('http://example.com/*')
  })

  it('treats a subdomain as its own site', () => {
    expect(siteTarget('https://news.example.com/')?.pattern).toBe('https://news.example.com/*')
  })

  it('drops the port, which match patterns do not carry', () => {
    expect(siteTarget('http://localhost:8080/index.html')?.pattern).toBe('http://localhost/*')
  })

  /** Enabling must be impossible where an extension cannot or should not run. */
  it.each([
    'about:addons',
    'moz-extension://abc/popup.html',
    'file:///C:/tmp/page.html',
    'view-source:https://example.com/',
    'data:text/html,hi',
    'javascript:alert(1)',
  ])('refuses %s', (url) => {
    expect(siteTarget(url)).toBeNull()
  })

  it('refuses an empty or malformed URL', () => {
    expect(siteTarget(undefined)).toBeNull()
    expect(siteTarget('')).toBeNull()
    expect(siteTarget('not a url')).toBeNull()
  })
})

describe('isApiOrigin', () => {
  it('recognises our own endpoints', () => {
    expect(isApiOrigin('https://translate.googleapis.com/*')).toBe(true)
    expect(isApiOrigin('https://translation.googleapis.com/*')).toBe(true)
  })

  it('does not mistake a user site for one', () => {
    expect(isApiOrigin('https://example.com/*')).toBe(false)
  })
})
