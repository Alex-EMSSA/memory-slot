/**
 * Where the tooltip goes. Pure geometry, so it can be tested without a browser.
 *
 * All coordinates are viewport coordinates, the same frame getBoundingClientRect returns,
 * which is why the tooltip is positioned with `fixed` and needs no scroll arithmetic.
 */

export type Box = { top: number; left: number; width: number; height: number }
export type Viewport = { width: number; height: number }

export type Placement = {
  left: number
  top: number
  /** True when there was no room above and the tooltip had to flip under the text. */
  below: boolean
}

/** Gap between the text and the tooltip, and the minimum margin from the viewport edge. */
const GAP = 8
const EDGE = 4

export function placeTooltip(anchor: Box, size: Viewport, viewport: Viewport): Placement {
  const above = anchor.top - size.height - GAP
  const below = above < EDGE

  const top = below
    ? Math.min(anchor.top + anchor.height + GAP, viewport.height - size.height - EDGE)
    : above

  // Centred on the text, then pulled back inside the viewport rather than clipped.
  const centred = anchor.left + anchor.width / 2 - size.width / 2
  const left = clamp(centred, EDGE, Math.max(EDGE, viewport.width - size.width - EDGE))

  return { left, top: Math.max(EDGE, top), below }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Is the pointer inside this box, allowing a little slack for shaky hands? */
export function contains(box: Box, x: number, y: number, slack = 0): boolean {
  return (
    x >= box.left - slack &&
    x <= box.left + box.width + slack &&
    y >= box.top - slack &&
    y <= box.top + box.height + slack
  )
}

/**
 * Keeps the floating window inside the viewport.
 *
 * Called both while dragging and when the browser window is resized: a window dragged to the
 * right edge of a wide screen must not be stranded outside a narrow one.
 */
export function clampToViewport(
  x: number,
  y: number,
  size: Viewport,
  viewport: Viewport,
  margin = 8,
): { x: number; y: number } {
  const maxX = Math.max(margin, viewport.width - size.width - margin)
  const maxY = Math.max(margin, viewport.height - size.height - margin)
  return { x: clamp(x, margin, maxX), y: clamp(y, margin, maxY) }
}

/** Where the window sits before the user has ever moved it: the top right corner. */
export function defaultPanelPosition(size: Viewport, viewport: Viewport, margin = 16): {
  x: number
  y: number
} {
  return clampToViewport(viewport.width - size.width - margin, margin, size, viewport, margin)
}
