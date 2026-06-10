// electron/extensions/capability.test.cjs
const { ALL_CAPABILITIES, isKnownCapability, requireCapability, CapabilityError } = require('./capability.cjs')

describe('isKnownCapability', () => {
  it('accepts every capability in the registry', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(isKnownCapability(cap)).toBe(true)
    }
  })
  it('rejects unknown strings', () => {
    expect(isKnownCapability('nope')).toBe(false)
    expect(isKnownCapability('')).toBe(false)
    expect(isKnownCapability(null)).toBe(false)
  })
  it('includes "net" (Phase 3)', () => {
    expect(isKnownCapability('net')).toBe(true)
    expect(ALL_CAPABILITIES).toContain('net')
  })
  it('recognises mcp.call as a known capability', () => {
    expect(isKnownCapability('mcp.call')).toBe(true)
  })
  it('includes "process" (run whitelisted binaries)', () => {
    expect(isKnownCapability('process')).toBe(true)
    expect(ALL_CAPABILITIES).toContain('process')
  })
})

describe('requireCapability', () => {
  const manifest = { id: 'x', capabilities: ['activeDoc.read', 'workspace.list'] }
  it('returns silently when capability is declared', () => {
    expect(() => requireCapability(manifest, 'activeDoc.read')).not.toThrow()
  })
  it('throws CapabilityError when capability is NOT declared', () => {
    expect(() => requireCapability(manifest, 'activeDoc.write')).toThrow(CapabilityError)
  })
  it('CapabilityError carries the missing capability', () => {
    try { requireCapability(manifest, 'storage') } catch (e) {
      expect(e).toBeInstanceOf(CapabilityError)
      expect(e.missing).toBe('storage')
      expect(e.extensionId).toBe('x')
    }
  })
  it('throws on an unknown capability string (developer error guard)', () => {
    expect(() => requireCapability(manifest, 'made-up')).toThrow(/unknown capability/i)
  })
})
