import { describe, expect, it } from 'vitest'
import { decodeEntities } from '../src/lib/providers/entities'

describe('decodeEntities', () => {
  it('decodes the escapes the API returns even in text mode', () => {
    expect(decodeEntities('don&#39;t &amp; won&#39;t')).toBe("don't & won't")
  })

  it('decodes hex references', () => {
    expect(decodeEntities('caf&#xe9;')).toBe('café')
  })

  it('leaves unknown entities alone rather than mangling them', () => {
    expect(decodeEntities('50&percnt; &notreal;')).toBe('50&percnt; &notreal;')
  })

  it('ignores out-of-range code points', () => {
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;')
  })
})
