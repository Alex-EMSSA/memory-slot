import { describe, expect, it } from 'vitest'
import { isValidColour, parseHex, readableTextColour, relativeLuminance } from '../src/lib/colour'

describe('parseHex', () => {
  it('reads the six digit form, with or without the hash', () => {
    expect(parseHex('#4f46e5')).toEqual({ r: 0x4f, g: 0x46, b: 0xe5 })
    expect(parseHex('4f46e5')).toEqual({ r: 0x4f, g: 0x46, b: 0xe5 })
  })

  it('expands the three digit form', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('#f00')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('is case insensitive and tolerates spacing', () => {
    expect(parseHex('  #FFAA00 ')).toEqual({ r: 255, g: 170, b: 0 })
  })

  it('rejects anything that is not a hex colour', () => {
    for (const value of ['', 'red', '#12', '#1234567', 'rgb(0,0,0)', '#gggggg']) {
      expect(parseHex(value)).toBeNull()
    }
  })
})

describe('relativeLuminance', () => {
  it('puts black at zero and white at one', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })

  it('weighs green more heavily than blue, as the eye does', () => {
    const green = relativeLuminance({ r: 0, g: 255, b: 0 })
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 })
    expect(green).toBeGreaterThan(blue)
  })
})

/** The user picks one colour; picking both is how you get yellow on white. */
describe('readableTextColour', () => {
  it('uses dark text on light backgrounds', () => {
    for (const light of ['#ffffff', '#ffe066', '#c8f7c5', '#f5f5f5']) {
      expect(readableTextColour(light)).toBe('#1f2328')
    }
  })

  it('uses light text on dark backgrounds', () => {
    for (const dark of ['#000000', '#4f46e5', '#8b0000', '#1c1b22']) {
      expect(readableTextColour(dark)).toBe('#ffffff')
    }
  })

  it('falls back to light text when the value is not a colour', () => {
    expect(readableTextColour('nonsense')).toBe('#ffffff')
  })
})

describe('isValidColour', () => {
  it('accepts what a colour input produces', () => {
    expect(isValidColour('#4f46e5')).toBe(true)
  })

  it('rejects an empty value, which means "follow the system theme"', () => {
    expect(isValidColour('')).toBe(false)
  })
})
