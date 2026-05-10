import { diffWordsWithSpace, type Change } from 'diff'

export function computeDiff(oldText: string, newText: string): Change[] {
  return diffWordsWithSpace(oldText, newText)
}
