const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { hashExtensionDir } = require('./manifest-hash.cjs')

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'canv-hash-'))
}

describe('hashExtensionDir', () => {
  it('produces a stable sha256 over manifest + entry files', async () => {
    const d = makeDir()
    fs.writeFileSync(path.join(d, 'manifest.json'), '{"id":"x"}')
    fs.mkdirSync(path.join(d, 'panels'))
    fs.writeFileSync(path.join(d, 'panels', 'main.html'), 'hello')
    const a = await hashExtensionDir(d)
    const b = await hashExtensionDir(d)
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it('changes when any covered file changes', async () => {
    const d = makeDir()
    fs.writeFileSync(path.join(d, 'manifest.json'), '{"id":"x"}')
    fs.writeFileSync(path.join(d, 'panels-main.html'), 'a')
    const before = await hashExtensionDir(d)
    fs.writeFileSync(path.join(d, 'panels-main.html'), 'b')
    const after = await hashExtensionDir(d)
    expect(after).not.toBe(before)
  })

  it('ignores settings.json and log/ subtree', async () => {
    const d = makeDir()
    fs.writeFileSync(path.join(d, 'manifest.json'), '{"id":"x"}')
    fs.writeFileSync(path.join(d, 'panels.html'), 'p')
    fs.writeFileSync(path.join(d, 'settings.json'), '{}')
    const before = await hashExtensionDir(d)
    fs.writeFileSync(path.join(d, 'settings.json'), '{"k":"v"}')
    fs.mkdirSync(path.join(d, 'log'))
    fs.writeFileSync(path.join(d, 'log', 'runtime.log'), 'noise')
    const after = await hashExtensionDir(d)
    expect(after).toBe(before)
  })

  it('is sensitive to file path AND contents (not just contents)', async () => {
    const d1 = makeDir()
    fs.writeFileSync(path.join(d1, 'manifest.json'), '{}')
    fs.writeFileSync(path.join(d1, 'a.txt'), 'hello')
    const d2 = makeDir()
    fs.writeFileSync(path.join(d2, 'manifest.json'), '{}')
    fs.writeFileSync(path.join(d2, 'b.txt'), 'hello')
    expect(await hashExtensionDir(d1)).not.toBe(await hashExtensionDir(d2))
  })
})
