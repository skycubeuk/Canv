const path = require('node:path')
const fs = require('node:fs')
const { validateManifest } = require('../manifest-schema.cjs')

describe('test fixtures', () => {
  it('hello-world manifest is valid', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'hello-world', 'manifest.json'), 'utf-8'))
    const r = validateManifest(raw)
    if (!r.ok) throw new Error(r.errors.join('\n'))
    expect(r.manifest.id).toBe('hello-world')
  })

  it('hello-world-phase3 manifest is valid', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'hello-world-phase3', 'manifest.json'), 'utf-8'))
    const r = validateManifest(raw)
    if (!r.ok) throw new Error(r.errors.join('\n'))
    expect(r.manifest.id).toBe('hello-world-phase3')
    expect(r.manifest.capabilities).toContain('ai')
    expect(r.manifest.capabilities).toContain('net')
    expect(r.manifest.network).toContain('wttr.in')
  })

  it('phase5a-kitchen-sink manifest is valid', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'phase5a-kitchen-sink', 'manifest.json'), 'utf-8'))
    const r = validateManifest(raw)
    if (!r.ok) throw new Error(r.errors.join('\n'))
    expect(r.manifest.contributions).toHaveLength(3)
  })
})
