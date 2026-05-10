import * as Lucide from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const NON_ICON_KEYS = new Set([
  'Icon',
  'LucideIcon',
  'IconNode',
  'IconNodeChild',
  'createLucideIcon',
  'default',
])

const registry: Record<string, LucideIcon> = {}
for (const [name, value] of Object.entries(Lucide)) {
  if (NON_ICON_KEYS.has(name)) continue
  if (!/^[A-Z]/.test(name)) continue
  if (name.endsWith('Icon')) continue
  if (value == null) continue
  registry[name] = value as LucideIcon
}

export const ICON_NAMES: ReadonlySet<string> = new Set(Object.keys(registry))

export function lookupIcon(name: string): LucideIcon | undefined {
  return registry[name]
}

/**
 * Returns the closest known icon name to `name`, or null if none is within an
 * acceptable Levenshtein distance. Distance threshold scales with input length:
 * up to 2 edits for short names, 3 for longer ones.
 */
export function suggestIcon(name: string): string | null {
  const threshold = name.length >= 6 ? 3 : 2
  let best: string | null = null
  let bestDist = Infinity
  for (const candidate of ICON_NAMES) {
    if (Math.abs(candidate.length - name.length) > threshold) continue
    const d = levenshtein(name, candidate)
    if (d < bestDist) {
      bestDist = d
      best = candidate
    }
  }
  return bestDist <= threshold ? best : null
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = new Array(b.length + 1)
  const curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}
