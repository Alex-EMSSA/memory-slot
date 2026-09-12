// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isEditable, isTranslatable } from '../src/content/trigger'

describe('isTranslatable', () => {
  it('accepts a word and a phrase', () => {
    expect(isTranslatable('hello')).toBe(true)
    expect(isTranslatable('the quick brown fox')).toBe(true)
  })

  it('accepts non-Latin scripts', () => {
    expect(isTranslatable('привіт')).toBe(true)
    expect(isTranslatable('こんにちは')).toBe(true)
  })

  it('ignores empty or whitespace-only selections', () => {
    expect(isTranslatable('')).toBe(false)
    expect(isTranslatable('   \n  ')).toBe(false)
  })

  /** Selecting a price or a timestamp is not a translation request. */
  it('ignores selections without letters', () => {
    expect(isTranslatable('12345')).toBe(false)
    expect(isTranslatable('19:45')).toBe(false)
    expect(isTranslatable('— , . !')).toBe(false)
    expect(isTranslatable('€ 42,00')).toBe(false)
  })

  it('ignores a selection longer than a flashcard', () => {
    expect(isTranslatable('word '.repeat(41))).toBe(false)
    expect(isTranslatable('word '.repeat(39))).toBe(true)
  })
})

describe('isEditable', () => {
  function fixture(html: string): Element {
    document.body.innerHTML = html
    const node = document.querySelector('[data-probe]')
    if (!node) throw new Error('fixture needs an element marked with data-probe')
    return node
  }

  it('is false for ordinary text', () => {
    expect(isEditable(fixture('<p data-probe>hello</p>'))).toBe(false)
  })

  /** Typing is not reading: we stay out of the user's way in form fields. */
  it('is true inside a text input', () => {
    expect(isEditable(fixture('<input data-probe value="hello" />'))).toBe(true)
  })

  it('is true inside a textarea', () => {
    expect(isEditable(fixture('<textarea data-probe>hello</textarea>'))).toBe(true)
  })

  it('is true inside a contenteditable region', () => {
    expect(isEditable(fixture('<div contenteditable="true"><span data-probe>hi</span></div>'))).toBe(
      true,
    )
  })

  it('walks up from a text node, which is what a selection actually anchors to', () => {
    const element = fixture('<textarea data-probe>hello</textarea>')
    const text = document.createTextNode('hello')
    element.append(text)
    expect(isEditable(text)).toBe(true)
  })

  it('is false for null', () => {
    expect(isEditable(null)).toBe(false)
  })
})
