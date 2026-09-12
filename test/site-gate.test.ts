import { describe, expect, it, vi } from 'vitest'
import { installBrowserStub } from './helpers/browser-stub'

const API_ORIGINS = ['https://translate.googleapis.com/*', 'https://translation.googleapis.com/*']

async function loadGate(origins: string[] = []) {
  vi.resetModules()
  const stub = installBrowserStub({}, [...API_ORIGINS, ...origins])
  const module = await import('../src/background/site-gate')
  return { ...module, stub }
}

describe('site gate', () => {
  it('does not count our own API hosts as enabled sites', async () => {
    const gate = await loadGate()
    expect(await gate.enabledSites()).toEqual([])
  })

  it('lists granted sites', async () => {
    const gate = await loadGate(['https://example.com/*', 'https://a.org/*'])
    expect(await gate.enabledSites()).toEqual(['https://a.org/*', 'https://example.com/*'])
  })

  it('reports whether one site is enabled', async () => {
    const gate = await loadGate(['https://example.com/*'])
    expect(await gate.isEnabled('https://example.com/*')).toBe(true)
    expect(await gate.isEnabled('https://other.com/*')).toBe(false)
  })

  /**
   * The point of the whole design: with nothing enabled there must be no registration,
   * so no content script can run anywhere.
   */
  it('registers nothing when no site is enabled', async () => {
    const gate = await loadGate()
    await gate.syncRegistrations()

    expect(gate.stub.scripts.size).toBe(0)
    expect(gate.stub.calls.register).toBe(0)
  })

  it('registers the content script for enabled sites only', async () => {
    const gate = await loadGate(['https://example.com/*'])
    await gate.syncRegistrations()

    const script = gate.stub.scripts.get('memory-slot-content')
    expect(script?.matches).toEqual(['https://example.com/*'])
    expect(script?.js).toEqual(['content.js'])
    expect(script?.allFrames).toBe(true)
    expect(script?.persistAcrossSessions).toBe(true)
  })

  /** Injecting into Google's translation endpoint would be absurd and slightly alarming. */
  it('never registers against our own API hosts', async () => {
    const gate = await loadGate(['https://example.com/*'])
    await gate.syncRegistrations()

    const matches = gate.stub.scripts.get('memory-slot-content')?.matches ?? []
    for (const api of API_ORIGINS) expect(matches).not.toContain(api)
  })

  it('updates the existing registration instead of registering twice', async () => {
    const gate = await loadGate(['https://example.com/*'])
    await gate.syncRegistrations()

    gate.stub.origins.add('https://second.com/*')
    await gate.syncRegistrations()

    expect(gate.stub.calls.register).toBe(1)
    expect(gate.stub.calls.update).toBe(1)
    expect(gate.stub.scripts.get('memory-slot-content')?.matches).toEqual([
      'https://example.com/*',
      'https://second.com/*',
    ])
  })

  /** The user can revoke access from about:addons without ever opening our UI. */
  it('unregisters when the last site is revoked behind our back', async () => {
    const gate = await loadGate(['https://example.com/*'])
    await gate.syncRegistrations()
    expect(gate.stub.scripts.size).toBe(1)

    gate.stub.origins.delete('https://example.com/*')
    await gate.syncRegistrations()

    expect(gate.stub.scripts.size).toBe(0)
    expect(gate.stub.calls.unregister).toBe(1)
  })

  it('is idempotent, so any trigger can call it', async () => {
    const gate = await loadGate(['https://example.com/*'])
    await gate.syncRegistrations()
    await gate.syncRegistrations()
    await gate.syncRegistrations()

    expect(gate.stub.calls.register).toBe(1)
    expect(gate.stub.scripts.get('memory-slot-content')?.matches).toEqual([
      'https://example.com/*',
    ])
  })
})
