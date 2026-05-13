'use strict'
// describe/it/expect injected by vitest globals — do NOT require node:test
const fsp = require('node:fs/promises')
const nodefs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const git = require('isomorphic-git')
const { createHistoryService } = require('./history-service.cjs')

async function tmp() {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'canv-e2e-'))
}

describe('history-service end-to-end', () => {
  it('init → manual → simulated AI before/after pair → restore', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'chapter-04.md'), '## v1\n', 'utf8')
    const svc = createHistoryService({ root })

    await svc.initRevisionArchaeology()

    const manual = await svc.createSnapshot({ reason: 'manual', summary: 'after first draft', files: ['chapter-04.md'] })
    expect(manual.reason).toBe('manual')

    // Simulate an AI turn: before snapshot, mutating edits, after snapshot, files patched
    const before = await svc.createSnapshot({ reason: 'before_ai_edit', summary: 'Before AI edit', files: [] })
    await fsp.writeFile(path.join(root, 'chapter-04.md'), '## v1 — improved\n', 'utf8')
    const after = await svc.createSnapshot({ reason: 'after_ai_edit', summary: 'After AI edit', files: ['chapter-04.md'] })
    await svc.patchSnapshotFiles(before.id, ['chapter-04.md'])

    const list = await svc.listSnapshots()
    expect(list[0].id).toBe(after.id) // newest first
    expect(list[0].files).toEqual(['chapter-04.md'])
    const beforePatched = list.find((s) => s.id === before.id)
    expect(beforePatched.files).toEqual(['chapter-04.md'])

    // Restore from the manual snapshot → should produce before_rollback
    const r = await svc.restoreFile(manual.id, 'chapter-04.md')
    expect(await fsp.readFile(path.join(root, 'chapter-04.md'), 'utf8')).toBe('## v1\n')
    expect(typeof r.mtimeMs).toBe('number')
    expect(r.mtimeMs).toBeGreaterThan(0)
    const rollback = await svc.getSnapshot(r.rollbackSnapshotId)
    expect(rollback.reason).toBe('before_rollback')

    // canv-history tip is the rollback safety snapshot
    const tip = await git.resolveRef({ fs: nodefs, dir: root, ref: 'refs/heads/canv-history' })
    expect(tip).toBe(rollback.commit)

    // User's HEAD should still NOT mention canv-history (we never touch it)
    const head = await fsp.readFile(path.join(root, '.git', 'HEAD'), 'utf8')
    expect(head.includes('canv-history')).toBe(false)
  })

  it('hidden snapshots stay on the branch but are filtered from listSnapshots', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'A', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const s1 = await svc.createSnapshot({ reason: 'manual', summary: 'one', files: [] })
    await svc.hideSnapshot(s1.id)

    // The commit must still be reachable from canv-history tip
    const tip = await git.resolveRef({ fs: nodefs, dir: root, ref: 'refs/heads/canv-history' })
    const log = await git.log({ fs: nodefs, dir: root, ref: tip, depth: 10 })
    const shas = log.map((c) => c.oid)
    expect(shas.includes(s1.commit)).toBe(true)

    // But listSnapshots filters it
    const visible = await svc.listSnapshots()
    expect(visible.find((s) => s.id === s1.id)).toBeUndefined()
  })
})
