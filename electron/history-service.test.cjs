'use strict'
// describe/it/expect injected by vitest globals — do NOT require node:test
const fsp = require('node:fs/promises')
const nodefs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const git = require('isomorphic-git')
const { createHistoryService } = require('./history-service.cjs')

async function tmp() {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'canv-hist-'))
}

describe('history-service init', () => {
  it('initRevisionArchaeology creates .git, canv-history branch, history-index.json, .gitignore entry, and a workspace_init snapshot', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), '# A\n', 'utf8')
    const svc = createHistoryService({ root })

    const result = await svc.initRevisionArchaeology()

    expect(result.branch).toBe('canv-history')
    expect(result.headCommit).toMatch(/^[0-9a-f]{40}$/)

    await fsp.stat(path.join(root, '.git'))

    const ref = await git.resolveRef({ fs: nodefs, dir: root, ref: 'refs/heads/canv-history' })
    expect(ref).toBe(result.headCommit)

    const idxRaw = await fsp.readFile(path.join(root, '.canv', 'history-index.json'), 'utf8')
    const idx = JSON.parse(idxRaw)
    expect(idx.schemaVersion).toBe(1)
    expect(idx.snapshots.length).toBe(1)
    expect(idx.snapshots[0].reason).toBe('workspace_init')
    expect(idx.snapshots[0].commit).toBe(result.headCommit)
    expect(idx.latestSnapshot).toBe(idx.snapshots[0].id)

    const gi = await fsp.readFile(path.join(root, '.gitignore'), 'utf8')
    expect(gi.split(/\r?\n/).includes('.canv/')).toBe(true)

    // HEAD untouched: should still point at default branch, not canv-history
    const head = await fsp.readFile(path.join(root, '.git', 'HEAD'), 'utf8')
    expect(head.includes('canv-history')).toBe(false)
  })

  it('initRevisionArchaeology is idempotent — second call does not create a second workspace_init', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), '# A\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const before = JSON.parse(await fsp.readFile(path.join(root, '.canv', 'history-index.json'), 'utf8'))
    await svc.initRevisionArchaeology()
    const after = JSON.parse(await fsp.readFile(path.join(root, '.canv', 'history-index.json'), 'utf8'))
    expect(after).toEqual(before)
  })
})
