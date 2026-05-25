/**
 * Find the unique [from,to) range of `quote` within `docText`.
 * Throws if the quote is empty, absent, or appears more than once
 * (the caller should pass a longer, unique quote).
 */
export function resolveUniqueQuote(docText: string, quote: string): { from: number; to: number } {
  if (quote.length === 0) throw new Error('quote must not be empty')
  const occurrences: number[] = []
  let i = docText.indexOf(quote)
  while (i !== -1) {
    occurrences.push(i)
    i = docText.indexOf(quote, i + 1)
  }
  if (occurrences.length === 0) {
    throw new Error(`quote not found in the document: "${quote.slice(0, 60)}"`)
  }
  if (occurrences.length > 1) {
    throw new Error(`quote appears ${occurrences.length} times; provide a longer, unique quote`)
  }
  return { from: occurrences[0], to: occurrences[0] + quote.length }
}
