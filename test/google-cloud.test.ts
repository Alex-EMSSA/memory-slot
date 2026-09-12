import { describe, expect, it } from 'vitest'
import { decodeEntities, parseCloudResponse } from '../src/lib/providers/google-cloud'
import { ProviderError } from '../src/lib/providers/types'

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

describe('parseCloudResponse', () => {
  it('reads the translation and the detected language', () => {
    const result = parseCloudResponse({
      data: { translations: [{ translatedText: 'привіт', detectedSourceLanguage: 'en' }] },
    })
    expect(result).toEqual({ text: 'привіт', detectedFrom: 'en' })
  })

  it('works without a detected language, which the API omits when source is given', () => {
    const result = parseCloudResponse({ data: { translations: [{ translatedText: 'привіт' }] } })
    expect(result.detectedFrom).toBeUndefined()
  })

  it('rejects an empty payload', () => {
    expect(() => parseCloudResponse({ data: { translations: [] } })).toThrow(ProviderError)
  })
})
