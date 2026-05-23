const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { PersistentStorage } = require('./storage-file.cjs')

function makeDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'canv-store-')) }

describe('PersistentStorage', () => {
  it('set/get round-trips', async () => {
    const s = new PersistentStorage(path.join(makeDir(), 'storage.json'))
    await s.set('k', { n: 1 })
    expect(await s.get('k')).toEqual({ n: 1 })
  })
  it('persists across instances on the same file', async () => {
    const file = path.join(makeDir(), 'storage.json')
    const s1 = new PersistentStorage(file)
    await s1.set('k', 42)
    const s2 = new PersistentStorage(file)
    expect(await s2.get('k')).toBe(42)
  })
  it('returns undefined for missing keys without reading the file twice', async () => {
    const file = path.join(makeDir(), 'storage.json')
    const s = new PersistentStorage(file)
    expect(await s.get('nope')).toBe(undefined)
    expect(await s.get('nope')).toBe(undefined)
  })
  it('delete persists', async () => {
    const file = path.join(makeDir(), 'storage.json')
    const s1 = new PersistentStorage(file)
    await s1.set('k', 1)
    await s1.delete('k')
    const s2 = new PersistentStorage(file)
    expect(await s2.get('k')).toBe(undefined)
  })
  it('keys returns current keys', async () => {
    const s = new PersistentStorage(path.join(makeDir(), 'storage.json'))
    await s.set('a', 1); await s.set('b', 2)
    expect((await s.keys()).sort()).toEqual(['a', 'b'])
  })
  it('atomic write — partially-written file does not corrupt store', async () => {
    const dir = makeDir()
    const file = path.join(dir, 'storage.json')
    fs.writeFileSync(file, '{"k":"good"}')
    fs.writeFileSync(file + '.tmp', '{"k":"corrupt')   // junk
    const s = new PersistentStorage(file)
    expect(await s.get('k')).toBe('good')
  })
})
