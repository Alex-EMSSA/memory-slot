/**
 * Shared limits. The content script and the background page must agree on these: a selection
 * the page accepts and the orchestrator then refuses is a silent failure with no explanation.
 */

/**
 * Longest selection we will translate, in characters.
 *
 * Generous on purpose. A thousand characters is far more than a flashcard should hold, but
 * translating a paragraph while reading is a legitimate use, and the card can be trimmed
 * afterwards. The ceiling exists because the text travels in a query string.
 */
export const MAX_TRANSLATION_LENGTH = 1000
