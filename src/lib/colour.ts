/**
 * Colour helpers for the user-chosen tooltip colour.
 *
 * The user picks one colour, the background; the text colour is derived. Letting someone
 * choose both is how you end up with yellow on white and a bug report.
 */

const DARK_TEXT = '#1f2328'
const LIGHT_TEXT = '#ffffff'

export type Rgb = { r: number; g: number; b: number }

/** Accepts #rgb and #rrggbb, with or without the hash. Anything else is not a colour. */
export function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, '')

  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = [...hex].map((digit) => parseInt(digit + digit, 16))
    return { r: r!, g: g!, b: b! }
  }

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    }
  }

  return null
}

/** WCAG relative luminance, which is what decides whether black or white text reads. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rl! + 0.7152 * gl! + 0.0722 * bl!
}

/** Black or white, whichever the reader can actually read on that background. */
export function readableTextColour(background: string): string {
  const rgb = parseHex(background)
  if (!rgb) return LIGHT_TEXT
  return relativeLuminance(rgb) > 0.4 ? DARK_TEXT : LIGHT_TEXT
}

export function isValidColour(value: string): boolean {
  return parseHex(value) !== null
}
