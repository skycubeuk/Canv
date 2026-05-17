'use strict'
// describe/it/expect injected by vitest globals — do NOT require node:test
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createHistoryService } = require('./history-service.cjs')

async function tmp() {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'canv-delta-'))
}

describe('history-service getSnapshotDelta', () => {
  it('returns one modified entry when a tracked file changes on disk', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const snap = await svc.createSnapshot({ reason: 'manual', summary: 'baseline', files: [] })

    await fsp.writeFile(path.join(root, 'a.md'), 'v2\n', 'utf8')
    const delta = await svc.getSnapshotDelta(snap.id)
    expect(delta).toEqual([{ relPath: 'a.md', status: 'modified' }])
  })

  it('returns added when a file is added on disk after the snapshot', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const snap = await svc.createSnapshot({ reason: 'manual', summary: 'baseline', files: [] })

    await fsp.writeFile(path.join(root, 'b.md'), 'new\n', 'utf8')
    const delta = await svc.getSnapshotDelta(snap.id)
    expect(delta).toEqual([{ relPath: 'b.md', status: 'added' }])
  })

  it('returns deleted when a file in the snapshot is missing on disk', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const snap = await svc.createSnapshot({ reason: 'manual', summary: 'baseline', files: [] })

    await fsp.unlink(path.join(root, 'a.md'))
    const delta = await svc.getSnapshotDelta(snap.id)
    expect(delta).toEqual([{ relPath: 'a.md', status: 'deleted' }])
  })

  it('ignores .git, .canv, and gitignored paths', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'a.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const snap = await svc.createSnapshot({ reason: 'manual', summary: 'baseline', files: [] })

    await fsp.writeFile(path.join(root, '.gitignore'), '.canv/\nignored.txt\n', 'utf8')
    await fsp.writeFile(path.join(root, 'ignored.txt'), 'noise\n', 'utf8')
    await fsp.mkdir(path.join(root, '.canv', 'sub'), { recursive: true })
    await fsp.writeFile(path.join(root, '.canv', 'sub', 'junk.json'), '{}', 'utf8')

    const delta = await svc.getSnapshotDelta(snap.id)
    // .gitignore itself was created by initRevisionArchaeology (ensureGitignoreEntry adds .canv/).
    // The snapshot captured it with content ".canv/\n"; the test overwrites it with new content,
    // so the delta shows it as modified. ignored.txt and .canv/ are excluded.
    expect(delta.map(d => d.relPath)).toEqual(['.gitignore'])
    expect(delta[0].status).toBe('modified') // content changed since snapshot
  })

  it('throws for unknown snapshot id', async () => {
    const root = await tmp()
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    await expect(svc.getSnapshotDelta('snap_does_not_exist')).rejects.toThrow(/Unknown snapshot/)
  })

  it('returns sorted list by relPath', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'b.md'), 'v1\n', 'utf8')
    await fsp.writeFile(path.join(root, 'a.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const snap = await svc.createSnapshot({ reason: 'manual', summary: 'baseline', files: [] })

    await fsp.writeFile(path.join(root, 'b.md'), 'v2\n', 'utf8')
    await fsp.writeFile(path.join(root, 'a.md'), 'v2\n', 'utf8')
    const delta = await svc.getSnapshotDelta(snap.id)
    expect(delta.map(d => d.relPath)).toEqual(['a.md', 'b.md'])
  })
})
