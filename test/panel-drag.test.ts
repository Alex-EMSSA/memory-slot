// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { startsDrag } from '../src/content/panel'

/**
 * The header captures the pointer while dragging, and a captured pointer never delivers its
 * click to the child it started on. That is exactly how the minimise and close buttons ended
 * up doing nothing, so the rule that prevents it is worth a test of its own.
 */
describe('startsDrag', () => {
  function header(): HTMLElement {
    document.body.innerHTML = `
      <div class="head">
        <div class="head__title">Memory Slot</div>
        <button class="iconbutton" id="fold">–</button>
        <button class="iconbutton" id="close"><span id="glyph">×</span></button>
      </div>
    `
    return document.querySelector('.head')!
  }

  it('drags when the press lands on the header itself', () => {
    expect(startsDrag(header())).toBe(true)
  })

  it('drags when the press lands on the title', () => {
    header()
    expect(startsDrag(document.querySelector('.head__title'))).toBe(true)
  })

  it('does not drag when the press lands on the minimise button', () => {
    header()
    expect(startsDrag(document.getElementById('fold'))).toBe(false)
  })

  it('does not drag when the press lands on the close button', () => {
    header()
    expect(startsDrag(document.getElementById('close'))).toBe(false)
  })

  /** A glyph inside a button is still the button as far as the reader is concerned. */
  it('does not drag when the press lands inside a button', () => {
    header()
    expect(startsDrag(document.getElementById('glyph'))).toBe(false)
  })

  it('drags when there is no element to judge', () => {
    expect(startsDrag(null)).toBe(true)
  })
})
