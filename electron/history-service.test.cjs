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

describe('history-service createSnapshot', () => {
  it('advances canv-history, leaves HEAD/index/user-branch byte-identical', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), '# A\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()

    // Pretend the user has a normal branch with content
    await git.add({ fs: nodefs, dir: root, filepath: 'a.md' })
    await git.commit({
      fs: nodefs, dir: root, message: 'user commit',
      author: { name: 'User', email: 'u@u', timestamp: 1700000000, timezoneOffset: 0 },
    })

    const beforeHead = await fsp.readFile(path.join(root, '.git', 'HEAD'), 'utf8')
    const beforeBranch = await git.resolveRef({ fs: nodefs, dir: root, ref: 'HEAD' })
    const beforeIndex = await fsp.readFile(path.join(root, '.git', 'index'))

    await fsp.writeFile(path.join(root, 'a.md'), '# A modified\n', 'utf8')
    const snap = await svc.createSnapshot({ reason: 'manual', summary: 'edit', files: ['a.md'], metadata: {} })

    expect(snap.id).toMatch(/^snap_/)
    expect(snap.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(snap.reason).toBe('manual')

    const tip = await git.resolveRef({ fs: nodefs, dir: root, ref: 'refs/heads/canv-history' })
    expect(tip).toBe(snap.commit)

    expect(await fsp.readFile(path.join(root, '.git', 'HEAD'), 'utf8')).toBe(beforeHead)
    expect(await git.resolveRef({ fs: nodefs, dir: root, ref: 'HEAD' })).toBe(beforeBranch)

    const afterIndex = await fsp.readFile(path.join(root, '.git', 'index'))
    expect(Buffer.compare(beforeIndex, afterIndex)).toBe(0)

    const idx = JSON.parse(await fsp.readFile(path.join(root, '.canv', 'history-index.json'), 'utf8'))
    expect(idx.snapshots.length).toBe(2)
    expect(idx.latestSnapshot).toBe(snap.id)
    expect(idx.snapshots[1].files).toEqual(['a.md'])
  })

  it('serialises concurrent calls without overlap', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'x', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const [s1, s2, s3] = await Promise.all([
      svc.createSnapshot({ reason: 'manual', summary: '1', files: [] }),
      svc.createSnapshot({ reason: 'manual', summary: '2', files: [] }),
      svc.createSnapshot({ reason: 'manual', summary: '3', files: [] }),
    ])
    const idx = JSON.parse(await fsp.readFile(path.join(root, '.canv', 'history-index.json'), 'utf8'))
    expect(idx.snapshots.length).toBe(4) // 1 init + 3 manual
    const ids = new Set([s1.id, s2.id, s3.id])
    expect(ids.size).toBe(3)
    const tip = await git.resolveRef({ fs: nodefs, dir: root, ref: 'refs/heads/canv-history' })
    expect(tip).toBe(idx.snapshots[3].commit)
  })
})

describe('history-service list/get/hide', () => {
  it('listSnapshots returns newest-first; hidden filtered by default; getSnapshot returns hidden', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'x', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const s1 = await svc.createSnapshot({ reason: 'manual', summary: 'one', files: [] })
    const s2 = await svc.createSnapshot({ reason: 'manual', summary: 'two', files: [] })
    await svc.hideSnapshot(s1.id)

    const visible = await svc.listSnapshots()
    expect(visible.length).toBe(2) // init + s2
    expect(visible[0].id).toBe(s2.id) // newest first

    const all = await svc.listSnapshots({ includeHidden: true })
    expect(all.length).toBe(3)

    const got = await svc.getSnapshot(s1.id)
    expect(got).not.toBeNull()
    expect(got.hidden).toBe(true)

    expect(await svc.getSnapshot('snap_does_not_exist')).toBeNull()
  })
})

describe('history-service diff/changes', () => {
  it('diffSnapshot returns base from snapshot commit and current from canv-history tip', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'one\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const s1 = await svc.createSnapshot({ reason: 'manual', summary: 'v1', files: ['a.md'] })
    await fsp.writeFile(path.join(root, 'a.md'), 'two\n', 'utf8')
    await svc.createSnapshot({ reason: 'manual', summary: 'v2', files: ['a.md'] })
    const d = await svc.diffSnapshot(s1.id, 'a.md')
    expect(d.baseText).toBe('one\n')
    expect(d.currentText).toBe('two\n')
  })

  it('getCurrentChanges reports working-tree vs tip differences (modified/added/deleted)', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'one\n', 'utf8')
    await fsp.writeFile(path.join(root, 'b.md'), 'B\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    await fsp.writeFile(path.join(root, 'a.md'), 'changed\n', 'utf8')
    await fsp.unlink(path.join(root, 'b.md'))
    await fsp.writeFile(path.join(root, 'c.md'), 'C\n', 'utf8')
    const ch = await svc.getCurrentChanges()
    const byPath = Object.fromEntries(ch.map((c) => [c.relPath, c.status]))
    expect(byPath['a.md']).toBe('modified')
    expect(byPath['b.md']).toBe('deleted')
    expect(byPath['c.md']).toBe('added')
  })

  it('getCurrentChanges returns sorted, empty list when no changes', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'one\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const ch = await svc.getCurrentChanges()
    expect(ch).toEqual([])
  })

  it('diffCurrent(relPath) returns tip text vs working-tree text', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'one\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    await fsp.writeFile(path.join(root, 'a.md'), 'two\n', 'utf8')
    const d = await svc.diffCurrent('a.md')
    expect(d.baseText).toBe('one\n')
    expect(d.currentText).toBe('two\n')
  })

  it('diffCurrent() with no arg returns the change list', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'one\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    await fsp.writeFile(path.join(root, 'a.md'), 'two\n', 'utf8')
    const d = await svc.diffCurrent()
    expect(Array.isArray(d)).toBe(true)
    expect(d[0].relPath).toBe('a.md')
    expect(d[0].status).toBe('modified')
  })
})

describe('history-service restore', () => {
  it('restoreFilePreview is read-only (does not touch disk)', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'one\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const s1 = await svc.createSnapshot({ reason: 'manual', summary: 'v1', files: ['a.md'] })
    await fsp.writeFile(path.join(root, 'a.md'), 'two\n', 'utf8')

    const before = await fsp.readFile(path.join(root, 'a.md'), 'utf8')
    const p = await svc.restoreFilePreview(s1.id, 'a.md')
    const after = await fsp.readFile(path.join(root, 'a.md'), 'utf8')

    expect(before).toBe(after)
    expect(p.snapshotText).toBe('one\n')
    expect(p.currentText).toBe('two\n')
  })

  it('restoreFile fires before_rollback safety snapshot first, then writes the blob', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'one\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const s1 = await svc.createSnapshot({ reason: 'manual', summary: 'v1', files: ['a.md'] })
    await fsp.writeFile(path.join(root, 'a.md'), 'TWO\n', 'utf8')

    const beforeHead = await fsp.readFile(path.join(root, '.git', 'HEAD'), 'utf8')
    const r = await svc.restoreFile(s1.id, 'a.md')

    expect(r.rollbackSnapshotId).toMatch(/^snap_/)
    expect(await fsp.readFile(path.join(root, 'a.md'), 'utf8')).toBe('one\n')

    const rollback = await svc.getSnapshot(r.rollbackSnapshotId)
    expect(rollback.reason).toBe('before_rollback')
    // The before_rollback snapshot's tree should contain the pre-restore content ('TWO\n')
    const blob = await svc.diffSnapshot(rollback.id, 'a.md')
    expect(blob.baseText).toBe('TWO\n')

    expect(await fsp.readFile(path.join(root, '.git', 'HEAD'), 'utf8')).toBe(beforeHead)
  })

  it('restoreFile creates intermediate directories if the path was deleted', async () => {
    const root = await tmp()
    await fsp.mkdir(path.join(root, 'chapters'), { recursive: true })
    await fsp.writeFile(path.join(root, 'chapters', 'one.md'), 'C1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const s1 = await svc.createSnapshot({ reason: 'manual', summary: 'v1', files: ['chapters/one.md'] })
    // User deletes the file (and its folder) entirely
    await fsp.rm(path.join(root, 'chapters'), { recursive: true })
    await svc.createSnapshot({ reason: 'manual', summary: 'gone', files: ['chapters/one.md'] })

    await svc.restoreFile(s1.id, 'chapters/one.md')
    expect(await fsp.readFile(path.join(root, 'chapters', 'one.md'), 'utf8')).toBe('C1\n')
  })

  it('restoreFile throws on unknown snapshot id', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'x', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    await expect(svc.restoreFile('snap_nope', 'a.md')).rejects.toThrow(/Unknown snapshot/)
  })
})

describe('history-service patchSnapshotFiles', () => {
  it('updates the files array on an existing snapshot entry', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'x', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const s = await svc.createSnapshot({ reason: 'before_ai_edit', summary: 'b', files: [] })
    await svc.patchSnapshotFiles(s.id, ['a.md', 'b.md'])
    const got = await svc.getSnapshot(s.id)
    expect(got.files).toEqual(['a.md', 'b.md'])
  })

  it('throws on unknown id', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'x', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    await expect(svc.patchSnapshotFiles('snap_nope', ['a.md'])).rejects.toThrow(/Unknown snapshot/)
  })
})
