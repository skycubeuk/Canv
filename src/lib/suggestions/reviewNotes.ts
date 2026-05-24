import { z } from 'zod'

const ReviewNoteSchema = z.object({
  quote: z.string().min(1),
  comment: z.string(),
})

type ReviewNote = z.infer<typeof ReviewNoteSchema>

export function parseReviewNotes(raw: string): Array<ReviewNote> | null {
  let text = raw.trim()

  // Strip ```json ... ``` or ``` ... ``` fence
  const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  } else {
    // Extract from first [ to last ]
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end === -1 || end < start) return null
    text = text.slice(start, end + 1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (!Array.isArray(parsed)) return null

  const valid: ReviewNote[] = []
  for (const item of parsed) {
    const result = ReviewNoteSchema.safeParse(item)
    if (result.success) {
      valid.push(result.data)
    }
  }

  return valid.length > 0 ? valid : null
}

export function anchorReviewNotes(
  selectionText: string,
  spanFrom: number,
  notes: Array<{ quote: string; comment: string }>
): Array<{ from: number; to: number; note: string }> {
  return notes.map(({ quote, comment }) => {
    const idx = selectionText.indexOf(quote)
    if (idx !== -1) {
      return { from: spanFrom + idx, to: spanFrom + idx + quote.length, note: comment }
    }
    return { from: spanFrom, to: spanFrom + selectionText.length, note: comment }
  })
}
