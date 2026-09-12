/**
 * HTML entities in translated text.
 *
 * Both Google Cloud and MyMemory escape their output even when asked for plain text, so
 * "don't" comes back as "don&#39;t". Storing that verbatim would put a literal &#39; on a
 * flashcard and read as a bug forever after.
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return match
      return String.fromCodePoint(code)
    }
    return NAMED[body.toLowerCase()] ?? match
  })
}
