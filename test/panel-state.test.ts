import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampToViewport, defaultPanelPosition } from '../src/content/placement'
import { installBrowserStub } from './helpers/browser-stub'

const SIZE = { width: 300, height: 200 }
const VIEWPORT = { width: 1200, height: 800 }

describe('clampToViewport', () => {
  it('leaves a window that is already inside alone', () => {
    expect(clampToViewport(400, 300, SIZE, VIEWPORT)).toEqual({ x: 400, y: 300 })
  })

  it('pulls a window back from the right and bottom edges', () => {
    const position = clampToViewport(5000, 5000, SIZE, VIEWPORT)
    expect(position).toEqual({ x: 1200 - 300 - 8, y: 800 - 200 - 8 })
  })

  it('pulls a window back from the top and left edges', () => {
    expect(clampToViewport(-500, -500, SIZE, VIEWPORT)).toEqual({ x: 8, y: 8 })
  })

  /** A window dragged to the edge of a wide screen must not be stranded off a narrow one. */
  it('rescues a window when the browser window shrinks', () => {
    const wide = clampToViewport(1600, 60, SIZE, { width: 1920, height: 1080 })
    expect(wide.x).toBe(1600)

    const narrow = clampToViewport(wide.x, wide.y, SIZE, { width: 800, height: 600 })
    expect(narrow.x).toBe(800 - 300 - 8)
  })

  it('keeps the window visible even when it is larger than the viewport', () => {
    const position = clampToViewport(0, 0, { width: 900, height: 900 }, { width: 400, height: 400 })
    expect(position).toEqual({ x: 8, y: 8 })
  })
})

describe('defaultPanelPosition', () => {
  it('is the top right corner', () => {
    expect(defaultPanelPosition(SIZE, VIEWPORT)).toEqual({ x: 1200 - 300 - 16, y: 16 })
  })

  it('stays on screen on a narrow window', () => {
    const position = defaultPanelPosition(SIZE, { width: 320, height: 500 })
    expect(position.x).toBeGreaterThanOrEqual(8)
  })
})

describe('panel state', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  async function freshState() {
    vi.resetModules()
    const stub = installBrowserStub()
    const module = await import('../src/content/panel-state')
    return { ...module, store: stub.store }
  }

  it('starts in the default corner, with nothing folded or closed', async () => {
    const state = await freshState()
    expect(await state.loadPanelState()).toEqual({ x: null, y: null, minimized: false, closed: false })
  })

  /** A drag produces hundreds of positions; only the last one is worth a storage write. */
  it('batches writes during a drag', async () => {
    vi.useFakeTimers()
    const state = await freshState()

    for (let x = 0; x < 50; x += 1) {
      state.savePanelState({ x, y: 10, minimized: false, closed: false })
    }
    expect(state.store['panel.v1']).toBeUndefined()

    await vi.advanceTimersByTimeAsync(300)
    expect(state.store['panel.v1']).toMatchObject({ x: 49 })
  })

  it('writes the final position immediately when the drag ends', async () => {
    vi.useFakeTimers()
    const state = await freshState()

    state.savePanelState({ x: 123, y: 45, minimized: false, closed: false })
    state.flushPanelState()
    await vi.advanceTimersByTimeAsync(0)

    expect(state.store['panel.v1']).toMatchObject({ x: 123, y: 45 })
  })

  it('reads back what was stored, so the window reappears where it was left', async () => {
    const first = await freshState()
    first.savePanelState({ x: 42, y: 84, minimized: true, closed: false })
    first.flushPanelState()
    await Promise.resolve()

    const second = await freshState()
    Object.assign(second.store, first.store)
    expect(await second.loadPanelState()).toMatchObject({ x: 42, y: 84, minimized: true })
  })

  it('falls back to defaults when the stored value is nonsense', async () => {
    const state = await freshState()
    state.store['panel.v1'] = 'not an object'
    expect(await state.loadPanelState()).toEqual({
      x: null,
      y: null,
      minimized: false,
      closed: false,
    })
  })
})
