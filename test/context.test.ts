// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { blockTextAround, sentenceAround } from '../src/content/context'

describe('sentenceAround', () => {
  const passage =
    'The fox was quick. The bright child solved it in a moment! Everyone else gave up.'

  it('returns the sentence holding the selection', () => {
    expect(sentenceAround(passage, 'bright')).toBe('The bright child solved it in a moment!')
  })

  it('keeps the closing punctuation', () => {
    expect(sentenceAround(passage, 'fox')).toBe('The fox was quick.')
  })

  it('handles the last sentence, which has no terminator after it', () => {
    expect(sentenceAround('No full stop here and bright too', 'bright')).toBe(
      'No full stop here and bright too',
    )
  })

  it('collapses the whitespace a page puts between lines', () => {
    expect(sentenceAround('The  bright\n  child\tsolved it.', 'bright')).toBe(
      'The bright child solved it.',
    )
  })

  it('matches a selection that spans line breaks in the markup', () => {
    expect(sentenceAround('A very bright child indeed.', 'bright\n  child')).toBe(
      'A very bright child indeed.',
    )
  })

  /** Repeating the selected word back at the user is not context. */
  it('gives nothing when the sentence is the selection', () => {
    expect(sentenceAround('bright', 'bright')).toBeUndefined()
  })

  it('gives nothing when the sentence is longer than a card should hold', () => {
    const wall = `${'word '.repeat(80)}bright.`
    expect(sentenceAround(wall, 'bright')).toBeUndefined()
  })

  it('gives nothing when the selection is not in the text', () => {
    expect(sentenceAround(passage, 'missing')).toBeUndefined()
  })

  it('gives nothing for empty input', () => {
    expect(sentenceAround('', 'bright')).toBeUndefined()
    expect(sentenceAround(passage, '   ')).toBeUndefined()
  })

  it('treats a newline as the end of a sentence, since headings rarely have full stops', () => {
    expect(sentenceAround('A bright headline\nThen the body text.', 'bright')).toBe(
      'A bright headline Then the body text.',
    )
  })
})

describe('blockTextAround', () => {
  it('takes the paragraph the selection sits in, not the whole page', () => {
    document.body.innerHTML =
      '<article><p>First paragraph.</p><p id="target">The bright child.</p></article>'
    const target = document.getElementById('target')!.firstChild

    expect(blockTextAround(target)).toBe('The bright child.')
  })

  it('climbs out of inline markup to the enclosing block', () => {
    document.body.innerHTML = '<p>The <em><b id="target">bright</b></em> child.</p>'
    const target = document.getElementById('target')

    expect(blockTextAround(target)).toBe('The bright child.')
  })

  it('falls back to the element itself when there is no block around it', () => {
    document.body.innerHTML = '<span id="target">loose text</span>'
    expect(blockTextAround(document.getElementById('target'))).toBe('loose text')
  })

  it('gives an empty string for nothing', () => {
    expect(blockTextAround(null)).toBe('')
  })
})
