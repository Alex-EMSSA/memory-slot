import { describe, expect, it } from 'vitest'
import { contains, placeTooltip } from '../src/content/placement'

const VIEWPORT = { width: 1000, height: 800 }
const SIZE = { width: 200, height: 40 }

describe('placeTooltip', () => {
  it('sits above the text and centred on it', () => {
    const placement = placeTooltip({ top: 300, left: 400, width: 100, height: 20 }, SIZE, VIEWPORT)

    expect(placement.below).toBe(false)
    expect(placement.top).toBe(300 - 40 - 8)
    expect(placement.left).toBe(400 + 50 - 100)
  })

  /** Near the top of the page there is no room above, so it goes under the text instead. */
  it('flips below when the text is too close to the top', () => {
    const placement = placeTooltip({ top: 10, left: 400, width: 100, height: 20 }, SIZE, VIEWPORT)

    expect(placement.below).toBe(true)
    expect(placement.top).toBe(10 + 20 + 8)
  })

  it('pulls back from the left edge instead of being clipped', () => {
    const placement = placeTooltip({ top: 300, left: 0, width: 40, height: 20 }, SIZE, VIEWPORT)
    expect(placement.left).toBe(4)
  })

  it('pulls back from the right edge instead of being clipped', () => {
    const placement = placeTooltip({ top: 300, left: 980, width: 20, height: 20 }, SIZE, VIEWPORT)
    expect(placement.left).toBe(VIEWPORT.width - SIZE.width - 4)
  })

  it('keeps a flipped tooltip inside a short viewport', () => {
    const placement = placeTooltip(
      { top: 5, left: 100, width: 50, height: 20 },
      SIZE,
      { width: 1000, height: 60 },
    )
    expect(placement.top).toBeLessThanOrEqual(60 - SIZE.height - 4)
    expect(placement.top).toBeGreaterThanOrEqual(4)
  })

  it('never places the tooltip off the top of the screen', () => {
    const placement = placeTooltip({ top: 0, left: 0, width: 0, height: 0 }, SIZE, VIEWPORT)
    expect(placement.top).toBeGreaterThanOrEqual(4)
  })
})

describe('contains', () => {
  const box = { top: 100, left: 100, width: 50, height: 20 }

  it('is true inside', () => {
    expect(contains(box, 120, 110)).toBe(true)
  })

  it('is false outside', () => {
    expect(contains(box, 300, 110)).toBe(false)
  })

  /** The slack is what stops the tooltip flickering when the pointer wobbles on an edge. */
  it('allows slack around the edges', () => {
    expect(contains(box, 155, 110)).toBe(false)
    expect(contains(box, 155, 110, 12)).toBe(true)
  })
})
