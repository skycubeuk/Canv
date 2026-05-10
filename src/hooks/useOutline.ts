import { useMemo } from 'react'
import { parseOutline, type OutlineNode } from '../lib/outline'

export function useOutline(text: string | null): OutlineNode[] {
  return useMemo(() => {
    if (text == null) return []
    return parseOutline(text)
  }, [text])
}
