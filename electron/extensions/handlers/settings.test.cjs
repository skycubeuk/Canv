const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { ExtensionRuntime } = require('../runtime.cjs')
const { createSettingsHandlers, _clearStoresForTest } = require('./settings.cjs')
const { CapabilityError } = require('../capability.cjs')

function mkDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'canv-set-')) }

function setup({ caps = ['settings'], settings = [] } = {}) {
  const dir = mkDir()
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext',
    manifest: { id: 'ext', capabilities: caps, settings },
    extensionDir: dir,
    webContentsId: 1,
  })
  const settingsFileFor = (_id) => path.join(dir, 'settings.json')
  const handlers = createSettingsHandlers({ runtime: rt, settingsFileFor })
  return { rt, dir, event: { sender: { id: 1 } }, handlers }
}

describe('settings handlers', () => {
  beforeEach(() => { _clearStoresForTest() })
  it('get returns default when no user value', async () => {
    const { handlers, event } = setup({ settings: [{ key: 'k', type: 'number', default: 42 }] })
    await expect(handlers['canvExt:settings.get'](event, 'k')).resolves.toBe(42)
  })
  it('set persists user value; get returns it', async () => {
    const { handlers, event, dir } = setup({ settings: [{ key: 'k', type: 'number', default: 42 }] })
    await handlers['canvExt:settings.set'](event, 'k', 100)
    await expect(handlers['canvExt:settings.get'](event, 'k')).resolves.toBe(100)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8'))).toEqual({ k: 100 })
  })
  it('set rejects value of wrong type for declared key', async () => {
    const { handlers, event } = setup({ settings: [{ key: 'k', type: 'number', default: 1 }] })
    await expect(handlers['canvExt:settings.set'](event, 'k', 'string')).rejects.toThrow(/number|type/i)
  })
  it('set rejects unknown key', async () => {
    const { handlers, event } = setup({ settings: [] })
    await expect(handlers['canvExt:settings.set'](event, 'nope', 1)).rejects.toThrow(/unknown/i)
  })
  it('requires settings capability', async () => {
    const { handlers, event } = setup({ caps: [], settings: [{ key: 'k', type: 'number' }] })
    await expect(handlers['canvExt:settings.get'](event, 'k')).rejects.toBeInstanceOf(CapabilityError)
  })
  it('getAll merges defaults and user values', async () => {
    const { handlers, event } = setup({ settings: [
      { key: 'a', type: 'number', default: 1 },
      { key: 'b', type: 'string', default: 'x' },
    ]})
    await handlers['canvExt:settings.set'](event, 'a', 99)
    await expect(handlers['canvExt:settings.getAll'](event)).resolves.toEqual({ a: 99, b: 'x' })
  })
  it('enum set rejects value outside options', async () => {
    const { handlers, event } = setup({ settings: [
      { key: 'mode', type: 'enum', options: ['a', 'b'], default: 'a' },
    ]})
    await expect(handlers['canvExt:settings.set'](event, 'mode', 'c')).rejects.toThrow(/option/i)
  })
  it('number min/max enforced', async () => {
    const { handlers, event } = setup({ settings: [
      { key: 'n', type: 'number', default: 0, min: 0, max: 100 },
    ]})
    await expect(handlers['canvExt:settings.set'](event, 'n', -1)).rejects.toThrow()
    await expect(handlers['canvExt:settings.set'](event, 'n', 101)).rejects.toThrow()
    await expect(handlers['canvExt:settings.set'](event, 'n', 50)).resolves.toBeUndefined()
  })
})
