/**
 * The sentence a selected word came from.
 *
 * A word alone is a poor flashcard: "bright" is four different words depending on whether it
 * described a room, a child or a future. Storing the sentence around it costs nothing now and
 * is impossible to recover later.
 */

/** Longer than this stops being context and starts being a wall of text on a card. */
const MAX_CONTEXT_LENGTH = 300

/** Where a sentence ends. Newlines count: plenty of pages never punctuate a heading. */
const TERMINATORS = new Set(['.', '!', '?', '…', '\n', '。', '！', '？', '؟'])

/** Blocks that read as one passage. Used to decide how far around the selection to look. */
const BLOCK_SELECTOR = 'p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6, dd, figcaption, article'

export function sentenceAround(text: string, selected: string): string | undefined {
  const haystack = text.replace(/\s+/g, ' ').trim()
  const needle = selected.replace(/\s+/g, ' ').trim()
  if (haystack === '' || needle === '') return undefined

  const at = haystack.indexOf(needle)
  if (at === -1) return undefined

  let start = at
  while (start > 0 && !TERMINATORS.has(haystack[start - 1]!)) start -= 1

  let end = at + needle.length
  while (end < haystack.length && !TERMINATORS.has(haystack[end]!)) end += 1
  if (end < haystack.length) end += 1 // keep the full stop

  const sentence = haystack.slice(start, end).trim()

  // A sentence identical to the selection adds nothing; neither does an essay.
  if (sentence === needle || sentence.length > MAX_CONTEXT_LENGTH) return undefined
  return sentence
}

/** Text of the passage the selection sits in, or the empty string if there is no telling. */
export function blockTextAround(node: Node | null): string {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  const block = element?.closest(BLOCK_SELECTOR) ?? element
  return block?.textContent ?? ''
}
