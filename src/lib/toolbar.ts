/**
 * Toolbar state for the current tab.
 *
 * This used to swap the toolbar icon between a colour and a grey variant. Firefox accepts an
 * SVG path in action.setIcon without complaint and then does not repaint the button, so the
 * call reported success while the user saw nothing change. A badge is drawn by Firefox itself,
 * depends on no image format, and is easier to spot than a shade of grey.
 *
 * Shared by the background page and the popup so the two can never disagree.
 */

const BADGE_ON = 'ON'
const BADGE_COLOUR = '#4f46e5'
const BADGE_TEXT_COLOUR = '#ffffff'

export const TITLE_ON = 'Memory Slot — on for this site'
export const TITLE_OFF = 'Memory Slot — off for this site'

/** Returns 'ok', or the reason it failed, so callers can surface it instead of guessing. */
export async function setToolbarState(tabId: number, on: boolean): Promise<string> {
  try {
    await browser.action.setBadgeText({ tabId, text: on ? BADGE_ON : '' })
    if (on) {
      await browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOUR })
      await browser.action.setBadgeTextColor({ tabId, color: BADGE_TEXT_COLOUR })
    }
    await browser.action.setTitle({ tabId, title: on ? TITLE_ON : TITLE_OFF })
    return 'ok'
  } catch (error) {
    // A closed tab is normal; anything else is a bug we must not hide.
    return error instanceof Error ? error.message : String(error)
  }
}
