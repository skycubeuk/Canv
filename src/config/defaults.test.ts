import { describe, it, expect } from 'vitest'
import { parseModeFiles } from './parse'
import { BUNDLED_DEFAULTS } from './defaults'

describe('bundled defaults', () => {
  it('all three default files parse and validate cleanly', () => {
    const result = parseModeFiles(BUNDLED_DEFAULTS)
    if (!result.ok) {
      throw new Error('defaults failed validation:\n' + JSON.stringify(result.errors, null, 2))
    }
    expect(result.modes.map((m) => m.id)).toEqual(['fiction', 'factual', 'technical'])
  })

  it('factual is the default mode', () => {
    const result = parseModeFiles(BUNDLED_DEFAULTS)
    if (!result.ok) throw new Error('expected ok')
    const factual = result.modes.find((m) => m.id === 'factual')!
    expect(factual.default).toBe(true)
    expect(result.modes.filter((m) => m.default)).toHaveLength(1)
  })

  it('action counts match the existing PROFILES enabledAgents lists', () => {
    const result = parseModeFiles(BUNDLED_DEFAULTS)
    if (!result.ok) throw new Error('expected ok')
    const counts = Object.fromEntries(result.modes.map((m) => [m.id, m.actions.length]))
    expect(counts).toEqual({ fiction: 12, factual: 14, technical: 10 })
  })

  it('snapshots the parsed default mode list (raw shape, no icon components)', () => {
    const result = parseModeFiles(BUNDLED_DEFAULTS)
    if (!result.ok) throw new Error('expected ok')
    // Strip Lucide components for a stable, human-readable snapshot.
    const stripped = result.modes.map((m) => ({
      ...m,
      icon: '<icon>',
      actions: m.actions.map((a) => ({ ...a, icon: '<icon>' })),
    }))
    expect(stripped).toMatchSnapshot()
  })
})
