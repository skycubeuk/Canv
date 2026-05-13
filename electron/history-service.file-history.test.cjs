'use strict'
// describe/it/expect injected by vitest globals — do NOT require node:test
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { createHistoryService } = require('./history-service.cjs')

async function tmp() {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'canv-filehist-'))
}

describe('history-service getFileHistory', () => {
  it('emits one entry per snapshot where the file blob is distinct', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'x.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()

    // s1: unchanged file
    await svc.createSnapshot({ reason: 'manual', summary: 's1' })

    // s2: changed
    await fsp.writeFile(path.join(root, 'x.md'), 'v2\n', 'utf8')
    const s2 = await svc.createSnapshot({ reason: 'manual', summary: 's2' })

    // s3: unchanged (same as s2)
    await svc.createSnapshot({ reason: 'manual', summary: 's3' })

    // s4: changed
    await fsp.writeFile(path.join(root, 'x.md'), 'v3\n', 'utf8')
    const s4 = await svc.createSnapshot({ reason: 'manual', summary: 's4' })

    const history = await svc.getFileHistory('x.md')
    // Walking newest→oldest with dedup:
    //   s4 v3 → emit
    //   s3 v3 → same as last emitted → skip
    //   s2 v2 → distinct → emit
    //   s1 v1 → distinct → emit
    //   workspace_init v1 → same as last emitted v1 → skip
    expect(history.find(h => h.snapshotId === s4.id)).toBeTruthy()
    expect(history.find(h => h.snapshotId === s2.id)).toBeTruthy()
  })

  it('returns empty array for a path that never existed in canv-history', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'x.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    await svc.createSnapshot({ reason: 'manual', summary: 's1' })

    const history = await svc.getFileHistory('never-existed.md')
    expect(history).toEqual([])
  })

  it('skips snapshots where the file is absent (deletion rows deferred in v1)', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'x.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const s1 = await svc.createSnapshot({ reason: 'manual', summary: 's1' })

    await fsp.unlink(path.join(root, 'x.md'))
    await svc.createSnapshot({ reason: 'manual', summary: 's2-deleted' })

    await fsp.writeFile(path.join(root, 'x.md'), 'v3\n', 'utf8')
    const s3 = await svc.createSnapshot({ reason: 'manual', summary: 's3-recreated' })

    const history = await svc.getFileHistory('x.md')
    // s2 (absent) is skipped; s3 (v3) and s1 (v1) both emitted, dedup against workspace_init v1
    expect(history.map(h => h.snapshotId)).toEqual([s3.id, s1.id])
  })

  it('filters hidden snapshots', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'x.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    const s1 = await svc.createSnapshot({ reason: 'manual', summary: 's1' })

    await fsp.writeFile(path.join(root, 'x.md'), 'v2\n', 'utf8')
    const s2 = await svc.createSnapshot({ reason: 'manual', summary: 's2' })

    await svc.hideSnapshot(s2.id)
    const history = await svc.getFileHistory('x.md')
    expect(history.map(h => h.snapshotId)).toEqual([s1.id])
  })

  it('returns SnapshotEntry-derived fields (snapshotId, commit, createdAt, reason, summary)', async () => {
    const root = await tmp()
    await fsp.writeFile(path.join(root, 'x.md'), 'v1\n', 'utf8')
    const svc = createHistoryService({ root })
    await svc.initRevisionArchaeology()
    await fsp.writeFile(path.join(root, 'x.md'), 'v2\n', 'utf8')
    const s = await svc.createSnapshot({ reason: 'manual', summary: 'edit chapter' })

    const history = await svc.getFileHistory('x.md')
    const top = history[0]
    expect(top.snapshotId).toBe(s.id)
    expect(top.commit).toBe(s.commit)
    expect(top.createdAt).toBe(s.createdAt)
    expect(top.reason).toBe('manual')
    expect(top.summary).toBe('edit chapter')
  })
})
