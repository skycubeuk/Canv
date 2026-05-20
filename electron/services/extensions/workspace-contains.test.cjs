'use strict'
const path = require('node:path')
const fsp = require('node:fs/promises')
const os = require('node:os')
const { createWorkspaceContainsEvaluator } = require('./workspace-contains.cjs')

function makeFakeWatcher() {
  const listeners = new Map()
  return {
    on(evt, cb) { listeners.set(evt, cb) },
    off(evt) { listeners.delete(evt) },
    emit(evt, payload) { const cb = listeners.get(evt); if (cb) cb(payload) },
  }
}

describe('createWorkspaceContainsEvaluator', () => {
  it('activates an extension whose glob matches a file in the vault', async () => {
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'wc-'))
    try {
      await fsp.mkdir(path.join(tmp, 'daily-notes'), { recursive: true })
      await fsp.writeFile(path.join(tmp, 'daily-notes', '2026-05-20.md'), '# hi')
      const installed = [{ id: 'dn', manifest: { activationEvents: ['workspaceContains:daily-notes/*.md'] } }]
      const activated = []
      const runtime = {
        manifestFor: () => null,
        activate: (id, trigger) => { activated.push({ id, trigger }) },
      }
      const watcher = makeFakeWatcher()
      const ev = createWorkspaceContainsEvaluator({
        getWorkspace: () => ({ root: tmp }),
        getInstalled: () => installed,
        runtime,
        watcher,
      })
      ev.rebuild()
      await ev.evaluateAtOpen()
      expect(activated.length).toBe(1)
      expect(activated[0].id).toBe('dn')
      expect(activated[0].trigger.kind).toBe('workspaceContains')
    } finally {
      await fsp.rm(tmp, { recursive: true, force: true })
    }
  })

  it('activates on chokidar add when a matching file appears later', () => {
    const installed = [{ id: 'dn', manifest: { activationEvents: ['workspaceContains:daily-notes/*.md'] } }]
    const activated = []
    const runtime = { manifestFor: () => null, activate: (id, t) => activated.push({ id, t }) }
    const watcher = makeFakeWatcher()
    const ev = createWorkspaceContainsEvaluator({
      getWorkspace: () => ({ root: '/x' }),
      getInstalled: () => installed,
      runtime,
      watcher,
    })
    ev.rebuild()
    watcher.emit('add', 'daily-notes/2026-05-20.md')
    expect(activated.length).toBe(1)
  })

  it('does not re-activate an already-active extension', () => {
    const installed = [{ id: 'dn', manifest: { activationEvents: ['workspaceContains:daily-notes/*.md'] } }]
    const activated = []
    const runtime = {
      manifestFor: (id) => id === 'dn' ? installed[0].manifest : null,
      activate: (id, t) => activated.push({ id, t }),
    }
    const watcher = makeFakeWatcher()
    const ev = createWorkspaceContainsEvaluator({
      getWorkspace: () => ({ root: '/x' }),
      getInstalled: () => installed,
      runtime,
      watcher,
    })
    ev.rebuild()
    watcher.emit('add', 'daily-notes/x.md')
    expect(activated.length).toBe(0)
  })

  it('dispose unwires the watcher subscription', () => {
    const watcher = makeFakeWatcher()
    const ev = createWorkspaceContainsEvaluator({
      getWorkspace: () => null,
      getInstalled: () => [],
      runtime: { manifestFor: () => null, activate: () => {} },
      watcher,
    })
    ev.dispose()
    watcher.emit('add', 'x')   // no throw
  })
})
