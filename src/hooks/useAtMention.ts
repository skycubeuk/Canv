import { useCallback, useMemo, useState } from 'react'
import { fuzzyScore } from '../lib/fuzzy'

/**
 * Looks back from `selStart` to find an active @-mention trigger. Returns
 * `null` when none is active. A trigger is a literal `@` preceded by
 * whitespace or at the very start of the field, followed by zero or more
 * non-whitespace characters up to the caret.
 *
 * Returns `triggerIndex` (the position of the @) and `query` (the text
 * between @ and the caret) so the caller can later splice the path in.
 */
export function findActiveTrigger(text: string, selStart: number): { triggerIndex: number; query: string } | null {
  for (let i = selStart - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch === '@') {
      const prev = i > 0 ? text[i - 1] : ''
      const atBoundary = i === 0 || /\s/.test(prev)
      if (!atBoundary) return null
      return { triggerIndex: i, query: text.slice(i + 1, selStart) }
    }
    if (/\s/.test(ch)) return null
  }
  return null
}

export interface AtMentionState {
  active: boolean
  query: string
  highlight: number
  suggestions: string[]
}

export interface UseAtMentionResult {
  state: AtMentionState
  sync: (text: string, selStart: number) => void
  close: () => void
  moveHighlight: (delta: number) => void
  pick: (text: string, selStart: number, overrideIndex?: number) => { nextText: string; nextCaret: number } | null
}

const MAX_SUGGESTIONS = 8

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

export function useAtMention(files: string[]): UseAtMentionResult {
  const [active, setActive] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const suggestions = useMemo<string[]>(() => {
    if (!active) return []
    if (files.length === 0) return []
    if (query === '') {
      return [...files].sort().slice(0, MAX_SUGGESTIONS)
    }
    const ranked: Array<{ file: string; score: number }> = []
    for (const f of files) {
      const baseScore = fuzzyScore(query, basename(f)).score
      const pathScore = fuzzyScore(query, f).score
      const total = baseScore * 2 + pathScore
      if (total > 0) ranked.push({ file: f, score: total })
    }
    ranked.sort((a, b) => b.score - a.score)
    return ranked.slice(0, MAX_SUGGESTIONS).map((r) => r.file)
  }, [active, query, files])

  const sync = useCallback((text: string, selStart: number) => {
    const trig = findActiveTrigger(text, selStart)
    if (!trig) {
      setActive(false)
      setQuery('')
      setHighlight(0)
      return
    }
    setActive(true)
    setQuery((prev) => (prev === trig.query ? prev : trig.query))
    setHighlight(0)
  }, [])

  const close = useCallback(() => {
    setActive(false)
    setQuery('')
    setHighlight(0)
  }, [])

  const moveHighlight = useCallback((delta: number) => {
    setHighlight((prev) => {
      const len = suggestions.length
      if (len === 0) return 0
      return (prev + delta + len) % len
    })
  }, [suggestions.length])

  const pick = useCallback((text: string, selStart: number, overrideIndex?: number): { nextText: string; nextCaret: number } | null => {
    if (!active) return null
    if (suggestions.length === 0) return null
    const trig = findActiveTrigger(text, selStart)
    if (!trig) return null
    const idx = overrideIndex ?? highlight
    const chosen = suggestions[idx] ?? suggestions[0]
    const insertion = `@${chosen}`
    const before = text.slice(0, trig.triggerIndex)
    const after = text.slice(selStart)
    const nextText = `${before}${insertion} ${after}`
    const nextCaret = trig.triggerIndex + insertion.length + 1
    return { nextText, nextCaret }
  }, [active, suggestions, highlight])

  return { state: { active, query, highlight, suggestions }, sync, close, moveHighlight, pick }
}
