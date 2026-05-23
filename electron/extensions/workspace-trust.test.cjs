const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { WorkspaceTrustStore } = require('./workspace-trust.cjs')

function mkUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'canv-ud-'))
}

describe('WorkspaceTrustStore', () => {
  it('returns "untrusted" for unknown workspace', () => {
    const s = new WorkspaceTrustStore(path.join(mkUserData(), 'trust.json'))
    expect(s.stateFor('/some/path')).toBe('untrusted')
  })
  it('records and reads trust state', () => {
    const f = path.join(mkUserData(), 'trust.json')
    const s1 = new WorkspaceTrustStore(f)
    s1.set('/ws/a', 'trusted')
    s1.set('/ws/b', 'always-disabled')
    const s2 = new WorkspaceTrustStore(f)
    expect(s2.stateFor('/ws/a')).toBe('trusted')
    expect(s2.stateFor('/ws/b')).toBe('always-disabled')
    expect(s2.stateFor('/ws/c')).toBe('untrusted')
  })
  it('forget removes a workspace entry', () => {
    const f = path.join(mkUserData(), 'trust.json')
    const s = new WorkspaceTrustStore(f)
    s.set('/ws/a', 'trusted')
    s.forget('/ws/a')
    expect(s.stateFor('/ws/a')).toBe('untrusted')
  })
  it('rejects unknown trust states', () => {
    const s = new WorkspaceTrustStore(path.join(mkUserData(), 'trust.json'))
    expect(() => s.set('/ws/a', 'maybe')).toThrow()
  })
  it('survives a corrupted trust file', () => {
    const f = path.join(mkUserData(), 'trust.json')
    fs.writeFileSync(f, 'not json')
    const s = new WorkspaceTrustStore(f)
    expect(s.stateFor('/x')).toBe('untrusted')
  })
})
