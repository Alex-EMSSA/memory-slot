/**
 * Where the floating window sits, and whether it is folded away.
 *
 * Kept in storage.local rather than in the page: the user positions the window once, and it
 * must be in the same place on the next article, on the next site and after a restart.
 */

const STORAGE_KEY = 'panel.v1'

/** Dragging fires continuously; writing to storage on every frame would be absurd. */
const SAVE_DELAY_MS = 300

export type PanelState = {
  /** null until the user has moved it, meaning "put it in the default corner". */
  x: number | null
  y: number | null
  minimized: boolean
  /** Closed hides the window until the next translation, it does not forget its position. */
  closed: boolean
}

export function defaultPanelState(): PanelState {
  return { x: null, y: null, minimized: false, closed: false }
}

export async function loadPanelState(): Promise<PanelState> {
  try {
    const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
    if (stored && typeof stored === 'object') {
      return { ...defaultPanelState(), ...(stored as Partial<PanelState>) }
    }
  } catch {
    // A window in the default corner beats no window at all.
  }
  return defaultPanelState()
}

let pending: PanelState | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/** Batched: a drag produces hundreds of positions and only the last one matters. */
export function savePanelState(state: PanelState): void {
  pending = state
  if (timer !== undefined) return

  timer = setTimeout(() => {
    timer = undefined
    const next = pending
    pending = null
    if (next) void write(next)
  }, SAVE_DELAY_MS)
}

/** Used when the drag ends: the final position should not wait out the delay. */
export function flushPanelState(): void {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  const next = pending
  pending = null
  if (next) void write(next)
}

async function write(state: PanelState): Promise<void> {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: state })
  } catch {
    // Losing the position costs one drag, not correctness.
  }
}
