'use strict'
// describe/it/expect are injected by vitest globals (do NOT require node:test)
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { readWorkspaceConfig, writeWorkspaceConfig, configPath } = require('./workspace-config.cjs')

async function tmp() {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'canv-wsc-'))
}

describe('workspace-config', () => {
  it('readWorkspaceConfig returns null when file is missing', async () => {
    const root = await tmp()
    expect(await readWorkspaceConfig(root)).toBeNull()
  })

  it('writeWorkspaceConfig + readWorkspaceConfig round-trip', async () => {
    const root = await tmp()
    const cfg = {
      schemaVersion: 1,
      createdAt: '2026-05-13T15:40:00Z',
      defaultProfile: 'fiction',
      revisionArchaeology: { enabled: true, backend: 'git-branch', branch: 'canv-history' },
    }
    await writeWorkspaceConfig(root, cfg)
    const read = await readWorkspaceConfig(root)
    expect(read).toEqual(cfg)
    const files = await fsp.readdir(path.join(root, '.canv'))
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  it('readWorkspaceConfig returns null on malformed JSON', async () => {
    const root = await tmp()
    await fsp.mkdir(path.join(root, '.canv'), { recursive: true })
    await fsp.writeFile(configPath(root), 'not json', 'utf8')
    expect(await readWorkspaceConfig(root)).toBeNull()
  })

  it('writeWorkspaceConfig creates .canv if missing', async () => {
    const root = await tmp()
    await writeWorkspaceConfig(root, {
      schemaVersion: 1, createdAt: '2026-05-13T15:40:00Z',
      defaultProfile: 'fiction', revisionArchaeology: { enabled: false },
    })
    const st = await fsp.stat(path.join(root, '.canv'))
    expect(st.isDirectory()).toBe(true)
  })
})
