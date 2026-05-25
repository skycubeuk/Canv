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

/** Characters replaced during normalisation (smart punctuation -> ASCII).
 *  Uses String.fromCharCode to build regexes so the Unicode smart-quote chars
 *  survive any editor/tool that coerces quote characters on save. */
// Build regex character classes using codepoints to avoid tool-mangling:
// U+2018 LEFT SINGLE, U+2019 RIGHT SINGLE, U+201C LEFT DOUBLE, U+201D RIGHT DOUBLE, U+2026 ELLIPSIS
const _s18 = String.fromCharCode(0x2018)
const _s19 = String.fromCharCode(0x2019)
const _s1c = String.fromCharCode(0x201c)
const _s1d = String.fromCharCode(0x201d)
const _s26 = String.fromCharCode(0x2026)
const SMART_SINGLE = new RegExp(`[${_s18}${_s19}]`, `g`)
const SMART_DOUBLE = new RegExp(`[${_s1c}${_s1d}]`, `g`)
const ELLIPSIS_RE = new RegExp(_s26, `g`)
// These replacements are plain ASCII so they survive fine:
const STRAIGHT_APOS = String.fromCharCode(0x27) // ‘
const STRAIGHT_DQ = String.fromCharCode(0x22)   // "
const SMART_QUOTE_MAP: Array<[RegExp, string]> = [
  [SMART_SINGLE, STRAIGHT_APOS],
  [SMART_DOUBLE, STRAIGHT_DQ],
  [ELLIPSIS_RE, `...`],
]

/**
 * Normalise text for fuzzy matching. Returns:
 *   - `norm`: normalised string (smart-punct -> ASCII, whitespace collapsed, lowercased)
 *   - `map`: map[normIdx] = origIdx of the corresponding original character
 */
function normalize(text: string): { norm: string; map: number[] } {
  // Build a working array of (char, originalIndex) pairs. `oi` is the UTF-16
  // offset in `text` (NOT the codepoint index): `indexOf`/`slice` and
  // CodeMirror positions are all UTF-16, so a supplementary-plane char (emoji)
  // before a match must advance `oi` by 2, not 1.
  let u16 = 0
  let chars: Array<{ ch: string; oi: number }> = []
  for (const ch of text) {
    chars.push({ ch, oi: u16 })
    u16 += ch.length // surrogate pairs have length 2
  }

  // Apply smart-quote substitutions on the char array.
  for (const [re, replacement] of SMART_QUOTE_MAP) {
    const src = chars.map((c) => c.ch).join('')
    const out: Array<{ ch: string; oi: number }> = []
    const matches: Array<{ index: number; matchLen: number }> = []
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      matches.push({ index: m.index, matchLen: m[0].length })
    }
    let srcIdx = 0
    for (const match of matches) {
      while (srcIdx < match.index) out.push(chars[srcIdx++])
      const origIdx = chars[match.index]?.oi ?? 0
      for (const rch of replacement) out.push({ ch: rch, oi: origIdx })
      srcIdx += match.matchLen
    }
    while (srcIdx < chars.length) out.push(chars[srcIdx++])
    chars = out
  }

  // Collapse whitespace runs (including newlines) to a single space, then
  // lowercase. `map` is indexed by UTF-16 code unit of the resulting `norm`
  // string (each appended char may be 1 or 2 code units, e.g. an emoji that
  // survives normalisation), so `norm.indexOf(...)` results align with it.
  const norm: string[] = []
  const map: number[] = []
  let prevWasSpace = false
  const pushChar = (out: string, oi: number) => {
    norm.push(out)
    for (let k = 0; k < out.length; k++) map.push(oi)
  }
  for (const { ch, oi } of chars) {
    if (/\s/.test(ch)) {
      if (!prevWasSpace) {
        pushChar(' ', oi)
        prevWasSpace = true
      }
    } else {
      pushChar(ch.toLowerCase(), oi)
      prevWasSpace = false
    }
  }

  return { norm: norm.join(''), map }
}

/** Minimum prefix length to try in partial matching (avoids false positives). */
const MIN_CHUNK = 8

export function anchorReviewNotes(
  selectionText: string,
  spanFrom: number,
  notes: Array<{ quote: string; comment: string }>
): Array<{ from: number; to: number; note: string; quote: string }> {
  // Pre-compute the normalised form of the selection once.
  const { norm: normText, map: textMap } = normalize(selectionText)
  const textLen = selectionText.length

  // Map a normalised [normIdx, normIdx+matchLen) range back to original UTF-16
  // offsets. `textMap[i]` is the original offset of the char starting at norm
  // unit i; the exclusive end is the original offset of the char just past the
  // last matched unit (or end-of-text when the match runs to the end).
  const mapRange = (normIdx: number, matchLen: number): { from: number; to: number } => {
    const from = textMap[normIdx]
    const endNormIdx = normIdx + matchLen
    const to = endNormIdx < textMap.length ? textMap[endNormIdx] : textLen
    return { from, to }
  }

  return notes.map(({ quote, comment }) => {
    // Step 1: exact match
    const exactIdx = selectionText.indexOf(quote)
    if (exactIdx !== -1) {
      return { from: spanFrom + exactIdx, to: spanFrom + exactIdx + quote.length, note: comment, quote }
    }

    // Step 2: normalised match (handles smart quotes, whitespace diffs, case)
    const { norm: normQuote } = normalize(quote)
    const normIdx = normText.indexOf(normQuote)
    if (normIdx !== -1) {
      const { from, to } = mapRange(normIdx, normQuote.length)
      return { from: spanFrom + from, to: spanFrom + to, note: comment, quote }
    }

    // Step 3: partial / leading-chunk match — try progressively shorter prefixes of
    // the normalised quote (down to MIN_CHUNK chars) until one appears in normText.
    // This handles paraphrased or truncated tails by anchoring at the start of
    // the portion that IS in the source.
    for (let chunkLen = Math.min(normQuote.length, normText.length); chunkLen >= MIN_CHUNK; chunkLen--) {
      const leadChunk = normQuote.slice(0, chunkLen)
      const chunkIdx = normText.indexOf(leadChunk)
      if (chunkIdx !== -1) {
        const { from, to } = mapRange(chunkIdx, chunkLen)
        return { from: spanFrom + from, to: spanFrom + to, note: comment, quote }
      }
    }

    // Step 4: unmatchable -> zero-width anchor (no highlight drawn)
    return { from: spanFrom, to: spanFrom, note: comment, quote }
  })
}
