import { describe, expect, it } from 'vitest'
import { parseCloudResponse } from '../src/lib/providers/google-cloud'
import { ProviderError } from '../src/lib/providers/types'

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
