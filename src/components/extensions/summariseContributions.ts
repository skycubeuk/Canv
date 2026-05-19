interface Contrib {
  type?: string
  extensions?: string[]
}

export function summariseContributions(contribs: unknown[]): string {
  const grouped = new Map<string, { count: number; exts: Set<string> }>()
  for (const c of contribs as Contrib[]) {
    if (!c || typeof c.type !== 'string') continue
    if (!grouped.has(c.type)) grouped.set(c.type, { count: 0, exts: new Set() })
    const entry = grouped.get(c.type)!
    entry.count += 1
    if (Array.isArray(c.extensions)) for (const e of c.extensions) entry.exts.add(e)
  }
  const parts: string[] = []
  for (const [type, { count, exts }] of grouped) {
    const plural = count > 1 ? 's' : ''
    const extList = exts.size > 0 ? ` (${[...exts].join(', ')})` : ''
    parts.push(`${count} ${type}${plural}${extList}`)
  }
  return parts.join(' · ')
}
