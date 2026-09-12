// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { isOurUi, registerUiRoot, unregisterUiRoot } from '../src/content/ui-roots'

describe('isOurUi', () => {
  let host: HTMLElement
  let pageText: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"><span id="inside">x</span></div><p id="page">text</p>'
    host = document.getElementById('host')!
    pageText = document.getElementById('page')!
    unregisterUiRoot(host)
  })

  it('does not claim page elements', () => {
    registerUiRoot(host)
    expect(isOurUi(pageText)).toBe(false)
  })

  /**
   * Events from a closed shadow root reach the document retargeted to the host, so the host
   * itself is what the trigger sees when the reader clicks our window.
   */
  it('recognises the host element', () => {
    registerUiRoot(host)
    expect(isOurUi(host)).toBe(true)
  })

  it('recognises anything inside the host', () => {
    registerUiRoot(host)
    expect(isOurUi(document.getElementById('inside'))).toBe(true)
  })

  it('claims nothing before anything is registered', () => {
    expect(isOurUi(host)).toBe(false)
  })

  it('forgets a host that has been torn down', () => {
    registerUiRoot(host)
    unregisterUiRoot(host)
    expect(isOurUi(host)).toBe(false)
  })

  it('ignores targets that are not nodes', () => {
    registerUiRoot(host)
    expect(isOurUi(null)).toBe(false)
    expect(isOurUi(new EventTarget())).toBe(false)
  })
})
