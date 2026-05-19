const fsPath = require('node:path')
const fsMod = require('node:fs')
const osMod = require('node:os')
const { ExtensionRuntime } = require('./runtime.cjs')
const { PersistentStorage } = require('./storage-file.cjs')

describe('ExtensionRuntime registry (pure)', () => {
  it('starts empty', () => {
    const rt = new ExtensionRuntime()
    expect(rt.list()).toEqual([])
    expect(rt.extensionDirFor('x')).toBe(null)
    expect(rt.manifestFor('x')).toBe(null)
  })

  it('registers and looks up entries', () => {
    const rt = new ExtensionRuntime()
    rt._registerForTest({
      id: 'hello',
      manifest: { id: 'hello', capabilities: ['storage'] },
      extensionDir: '/tmp/hello',
      webContentsId: 42,
    })
    expect(rt.list().map((e) => e.id)).toEqual(['hello'])
    expect(rt.extensionDirFor('hello')).toBe('/tmp/hello')
    expect(rt.manifestFor('hello').id).toBe('hello')
    expect(rt.webContentsIdToExtension(42)).toBe('hello')
  })

  it('removes entries cleanly', () => {
    const rt = new ExtensionRuntime()
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1 })
    rt._unregisterForTest('a')
    expect(rt.list()).toEqual([])
    expect(rt.webContentsIdToExtension(1)).toBe(null)
  })

  it('tracks per-extension event subscriptions', () => {
    const rt = new ExtensionRuntime()
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1 })
    rt.subscribe('a', 'activeDocChanged')
    rt.subscribe('a', 'docSaved')
    rt.subscribe('a', 'activeDocChanged') // dup → still one
    expect(rt.subscriptionsFor('a').sort()).toEqual(['activeDocChanged', 'docSaved'])
    rt.unsubscribe('a', 'docSaved')
    expect(rt.subscriptionsFor('a')).toEqual(['activeDocChanged'])
  })

  it('tracks per-extension in-memory storage', () => {
    const rt = new ExtensionRuntime()
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1 })
    rt.storageFor('a').set('key', { n: 1 })
    expect(rt.storageFor('a').get('key')).toEqual({ n: 1 })
    expect(rt.storageFor('a').keys()).toEqual(['key'])
    rt.storageFor('a').delete('key')
    expect(rt.storageFor('a').get('key')).toBe(undefined)
  })
})

describe('ExtensionRuntime spawn validation', () => {
  it('throws when spawn called without electron binding', async () => {
    const rt = new ExtensionRuntime() // no opts.electron
    await expect(rt.spawn({
      extensionDir: '/x', manifest: { id: 'a', contributions: [] },
      hostWindow: {},
    })).rejects.toThrow(/not bound to electron/i)
  })
  it('throws when spawning an already-spawned extension id', async () => {
    const rt = new ExtensionRuntime({ electron: {}, extensionPreloadPath: '/p' })
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 99 })
    await expect(rt.spawn({
      extensionDir: '/x', manifest: { id: 'a', contributions: [] },
      hostWindow: {},
    })).rejects.toThrow(/already spawned/)
  })
})

describe('ExtensionRuntime onCrash option', () => {
  it('stores onCrash callback when provided', () => {
    const cb = () => {}
    const rt = new ExtensionRuntime({ onCrash: cb })
    expect(rt._onCrash).toBe(cb)
  })
  it('defaults onCrash to null when not provided', () => {
    const rt = new ExtensionRuntime()
    expect(rt._onCrash).toBe(null)
  })
})

describe('ExtensionRuntime reparent + idsHostedBy', () => {
  function makeView(initialHost) {
    return {
      _hostWindow: initialHost,
      setBounds() {},
    }
  }
  function makeWin() {
    const calls = { add: [], remove: [] }
    const win = {
      isDestroyed: () => false,
      contentView: {
        addChildView: (v) => calls.add.push(v),
        removeChildView: (v) => calls.remove.push(v),
      },
      calls,
    }
    return win
  }

  it('reparent moves a view from one window to another and updates _hostWindow', () => {
    const rt = new ExtensionRuntime()
    const winA = makeWin()
    const winB = makeWin()
    const view = makeView(winA)
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1, view })

    rt.reparent('a', winB)

    expect(winA.calls.remove).toEqual([view])
    expect(winB.calls.add).toEqual([view])
    expect(view._hostWindow).toBe(winB)
  })

  it('reparent is a no-op when host is unchanged', () => {
    const rt = new ExtensionRuntime()
    const winA = makeWin()
    const view = makeView(winA)
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1, view })

    rt.reparent('a', winA)

    expect(winA.calls.remove).toEqual([])
    expect(winA.calls.add).toEqual([])
    expect(view._hostWindow).toBe(winA)
  })

  it('reparent tolerates a destroyed previous host', () => {
    const rt = new ExtensionRuntime()
    const winA = { ...makeWin(), isDestroyed: () => true }
    const winB = makeWin()
    const view = makeView(winA)
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1, view })

    rt.reparent('a', winB)

    // No removeChildView call on the destroyed window; view attaches to new host.
    expect(winA.calls.remove).toEqual([])
    expect(winB.calls.add).toEqual([view])
    expect(view._hostWindow).toBe(winB)
  })

  it('reparent is a no-op for unknown extensions or missing newHost', () => {
    const rt = new ExtensionRuntime()
    const winA = makeWin()
    const view = makeView(winA)
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1, view })

    rt.reparent('missing', winA)  // unknown id
    rt.reparent('a', null)        // null host
    rt.reparent('a', undefined)   // undefined host

    expect(winA.calls.remove).toEqual([])
    expect(winA.calls.add).toEqual([])
    expect(view._hostWindow).toBe(winA)
  })

  it('idsHostedBy returns only extensions whose view is parented to the given window', () => {
    const rt = new ExtensionRuntime()
    const winA = makeWin()
    const winB = makeWin()
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1, view: makeView(winA) })
    rt._registerForTest({ id: 'b', manifest: { id: 'b' }, extensionDir: '/y', webContentsId: 2, view: makeView(winB) })
    rt._registerForTest({ id: 'c', manifest: { id: 'c' }, extensionDir: '/z', webContentsId: 3, view: makeView(winA) })

    expect(rt.idsHostedBy(winA).sort()).toEqual(['a', 'c'])
    expect(rt.idsHostedBy(winB)).toEqual(['b'])
    expect(rt.idsHostedBy(null)).toEqual([])
  })
})

describe('ExtensionRuntime storage backend', () => {
  it('uses InMemoryStorage by default', async () => {
    const rt = new ExtensionRuntime()
    rt._registerForTest({ id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1 })
    const s = rt.storageFor('a')
    await s.set('k', 1)
    expect(await s.get('k')).toBe(1)
  })
  it('uses PersistentStorage when storageFile is supplied', async () => {
    const file = fsPath.join(fsMod.mkdtempSync(fsPath.join(osMod.tmpdir(), 'canv-rs-')), 'storage.json')
    const rt = new ExtensionRuntime()
    rt._registerForTest({
      id: 'a', manifest: { id: 'a' }, extensionDir: '/x', webContentsId: 1,
      storageFile: file,
    })
    const s = rt.storageFor('a')
    expect(s).toBeInstanceOf(PersistentStorage)
    await s.set('k', 'v')
    expect(JSON.parse(fsMod.readFileSync(file, 'utf-8'))).toEqual({ k: 'v' })
  })
})
