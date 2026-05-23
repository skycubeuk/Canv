'use strict'
// describe/it/expect/beforeEach/afterEach are injected by vitest globals
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

const fsService = require('./index.cjs')

function makeIpcMain() {
  const handlers = new Map()
  return {
    handle(name, fn) { handlers.set(name, fn) },
    async invoke(name, ...args) {
      const fn = handlers.get(name)
      if (!fn) throw new Error(`no handler: ${name}`)
      return fn({}, ...args)
    },
    removeHandler() {},
  }
}

function baseDeps(root, overrides = {}) {
  return {
    getWorkspace: () => ({ kind: 'local', root }),
    requireWorkspace: () => root,
    safeResolve: (r, rel) => {
      const abs = path.resolve(r, rel)
      if (!abs.startsWith(r + path.sep) && abs !== r) {
        throw new Error('path outside workspace')
      }
      return abs
    },
    isAllowedExt: () => true,
    buildTree: async () => [],
    getMainWindow: () => null,
    closeWorkspace: async () => {},
    setWorkspace: () => {},
    setHistory: () => {},
    onWorkspaceChangedGlobal: () => {},
    toRel: (r, abs) => path.relative(r, abs).replace(/\\/g, '/'),
    isAllowedDirEntry: () => true,
    ...overrides,
  }
}

describe('canvFS:applyEdits', () => {
  let root, ipcMain

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'apply-edits-'))
    ipcMain = makeIpcMain()
    fsService.registerIpcHandlers(ipcMain, baseDeps(root))
  })

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true })
  })

  it('writes every file atomically when all writes succeed', async () => {
    await fsp.writeFile(path.join(root, 'a.md'), '# A\n')
    await fsp.writeFile(path.join(root, 'b.md'), '# B\n')
    const r = await ipcMain.invoke('canvFS:applyEdits', [
      { path: 'a.md', newContent: '# A2\n', opts: { eol: 'lf', bom: false } },
      { path: 'b.md', newContent: '# B2\n', opts: { eol: 'lf', bom: false } },
    ])
    expect(r.ok).toBe(true)
    expect(await fsp.readFile(path.join(root, 'a.md'), 'utf-8')).toBe('# A2\n')
    expect(await fsp.readFile(path.join(root, 'b.md'), 'utf-8')).toBe('# B2\n')
  })

  it('returns { ok:false, reason:"file-not-found" } when a target is missing, writes nothing', async () => {
    await fsp.writeFile(path.join(root, 'a.md'), '# A\n')
    const r = await ipcMain.invoke('canvFS:applyEdits', [
      { path: 'a.md', newContent: '# A2\n', opts: { eol: 'lf', bom: false } },
      { path: 'missing.md', newContent: '# X\n', opts: { eol: 'lf', bom: false } },
    ])
    expect(r.ok).toBe(false)
    expect(r.error.reason).toBe('file-not-found')
    // a.md unchanged
    expect(await fsp.readFile(path.join(root, 'a.md'), 'utf-8')).toBe('# A\n')
  })

  it('refuses on stale mtime', async () => {
    await fsp.writeFile(path.join(root, 'a.md'), '# A\n')
    const r = await ipcMain.invoke('canvFS:applyEdits', [
      { path: 'a.md', newContent: '# A2\n', expectedMtimeMs: 1, opts: { eol: 'lf', bom: false } },
    ])
    expect(r.ok).toBe(false)
    expect(r.error.reason).toBe('stale-mtime')
    expect(await fsp.readFile(path.join(root, 'a.md'), 'utf-8')).toBe('# A\n')
  })

  it('rolls back the first write if the second write throws', async () => {
    await fsp.writeFile(path.join(root, 'a.md'), '# A\n')
    await fsp.writeFile(path.join(root, 'b.md'), '# B\n')
    // Sabotage the second write: chmod b.md to read-only so the write throws EACCES.
    fs.chmodSync(path.join(root, 'b.md'), 0o400)
    try {
      const r = await ipcMain.invoke('canvFS:applyEdits', [
        { path: 'a.md', newContent: '# A2\n', opts: { eol: 'lf', bom: false } },
        { path: 'b.md', newContent: '# B2\n', opts: { eol: 'lf', bom: false } },
      ])
      expect(r.ok).toBe(false)
      expect(r.error.reason).toBe('write-failed')
      // a.md restored from snapshot
      expect(await fsp.readFile(path.join(root, 'a.md'), 'utf-8')).toBe('# A\n')
      // b.md was never partially written — EACCES on open() leaves the file
      // contents untouched, but we assert it explicitly so a regression that
      // truncates-then-fails would surface here.
      expect(await fsp.readFile(path.join(root, 'b.md'), 'utf-8')).toBe('# B\n')
      // No rollback failure expected on the happy rollback path.
      expect(r.error.rollbackFailed).toBeUndefined()
    } finally {
      fs.chmodSync(path.join(root, 'b.md'), 0o600)
    }
  })

  it('reports rollbackFailed when restoring a previously-written file also throws', async () => {
    await fsp.writeFile(path.join(root, 'a.md'), '# A\n')
    await fsp.writeFile(path.join(root, 'b.md'), '# B\n')

    // Force the second write to fail AND the rollback of the first to fail.
    // Strategy: spy on fsp.writeFile so we control which calls succeed.
    //   - First write (a.md, # A2) → succeed (delegate to original).
    //   - Second write (b.md, # B2) → throw EACCES.
    //   - Rollback write (a.md, original snapshot) → throw EACCES.
    const realWriteFile = fsp.writeFile
    let nthCall = 0
    const spy = vi.spyOn(fsp, 'writeFile').mockImplementation(async (target, data, opts) => {
      nthCall += 1
      const abs = String(target)
      if (nthCall === 1 && abs.endsWith('a.md')) {
        return realWriteFile.call(fsp, target, data, opts)
      }
      // 2nd call: b.md primary write fails; 3rd call: rollback of a.md fails.
      const err = new Error('EACCES (simulated)')
      err.code = 'EACCES'
      throw err
    })
    try {
      const r = await ipcMain.invoke('canvFS:applyEdits', [
        { path: 'a.md', newContent: '# A2\n', opts: { eol: 'lf', bom: false } },
        { path: 'b.md', newContent: '# B2\n', opts: { eol: 'lf', bom: false } },
      ])
      expect(r.ok).toBe(false)
      expect(r.error.reason).toBe('write-failed')
      expect(r.error.rollbackFailed).toEqual(['a.md'])
    } finally {
      spy.mockRestore()
    }
  })

})
