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

  it('activates on chokidar add when a matching file appears later (absolute path → relative)', () => {
    // Chokidar emits absolute paths in production; the evaluator must convert
    // them to vault-relative POSIX before running globs. Use a realistic
    // absolute root + abs path to prove the conversion fires.
    const root = path.join(os.tmpdir(), 'wc-test-vault')
    const installed = [{ id: 'dn', manifest: { activationEvents: ['workspaceContains:daily-notes/*.md'] } }]
    const activated = []
    const runtime = { manifestFor: () => null, activate: (id, t) => activated.push({ id, t }) }
    const watcher = makeFakeWatcher()
    const ev = createWorkspaceContainsEvaluator({
      getWorkspace: () => ({ root }),
      getInstalled: () => installed,
      runtime,
      watcher,
    })
    ev.rebuild()
    watcher.emit('add', path.join(root, 'daily-notes', '2026-05-20.md'))
    expect(activated.length).toBe(1)
    expect(activated[0].t.kind).toBe('workspaceContains')
  })

  it('ignores chokidar add events for paths outside the vault root', () => {
    const root = path.join(os.tmpdir(), 'wc-test-vault')
    const installed = [{ id: 'dn', manifest: { activationEvents: ['workspaceContains:daily-notes/*.md'] } }]
    const activated = []
    const runtime = { manifestFor: () => null, activate: (id, t) => activated.push({ id, t }) }
    const watcher = makeFakeWatcher()
    const ev = createWorkspaceContainsEvaluator({
      getWorkspace: () => ({ root }),
      getInstalled: () => installed,
      runtime,
      watcher,
    })
    ev.rebuild()
    // Sibling-of-root path: would relativise to "../other/..." which the
    // evaluator must reject before running the matcher.
    watcher.emit('add', path.join(os.tmpdir(), 'other-vault', 'daily-notes', 'x.md'))
    expect(activated.length).toBe(0)
  })

  it('does not re-activate an already-active extension', () => {
    const root = path.join(os.tmpdir(), 'wc-test-vault')
    const installed = [{ id: 'dn', manifest: { activationEvents: ['workspaceContains:daily-notes/*.md'] } }]
    const activated = []
    const runtime = {
      manifestFor: (id) => id === 'dn' ? installed[0].manifest : null,
      activate: (id, t) => activated.push({ id, t }),
    }
    const watcher = makeFakeWatcher()
    const ev = createWorkspaceContainsEvaluator({
      getWorkspace: () => ({ root }),
      getInstalled: () => installed,
      runtime,
      watcher,
    })
    ev.rebuild()
    watcher.emit('add', path.join(root, 'daily-notes', 'x.md'))
    expect(activated.length).toBe(0)
  })

  it('dispose unwires the watcher subscription', () => {
    // Set up an evaluator that WOULD fire on a matching add — then dispose,
    // then emit. If the listener weren't gone, activated.length would be 1.
    const root = path.join(os.tmpdir(), 'wc-test-vault')
    const installed = [{ id: 'dn', manifest: { activationEvents: ['workspaceContains:daily-notes/*.md'] } }]
    const activated = []
    const runtime = { manifestFor: () => null, activate: (id, t) => activated.push({ id, t }) }
    const watcher = makeFakeWatcher()
    const ev = createWorkspaceContainsEvaluator({
      getWorkspace: () => ({ root }),
      getInstalled: () => installed,
      runtime,
      watcher,
    })
    ev.rebuild()
    ev.dispose()
    watcher.emit('add', path.join(root, 'daily-notes', 'x.md'))
    expect(activated.length).toBe(0)
  })
})
