import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { packExtension } from './pack-extension.mjs'

describe('packExtension', () => {
  let dir

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pack-ext-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function writeValidExtension(root) {
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify({
      id: 'pack-fixture',
      name: 'Pack Fixture',
      version: '1.0.0',
      engines: { canv: '^1.0.0' },
      capabilities: [],
      contributions: [{ type: 'panel', id: 'm', title: 'M', icon: 'info', location: 'left-sidebar', entry: 'index.html' }],
    }))
    await writeFile(path.join(root, 'index.html'), '<!doctype html><title>p</title>')
  }

  it('produces a .canvext zip containing the manifest at the root', async () => {
    await writeValidExtension(dir)
    const out = path.join(dir, 'pack-fixture-1.0.0.canvext')
    await packExtension({ folder: dir, output: out })
    const zip = new AdmZip(out)
    const entries = zip.getEntries().map((e) => e.entryName).sort()
    expect(entries).toContain('manifest.json')
    expect(entries).toContain('index.html')
  })

  it('refuses to pack an invalid manifest', async () => {
    await writeFile(path.join(dir, 'manifest.json'), '{"id":"bad"}')
    await writeFile(path.join(dir, 'index.html'), 'x')
    await expect(packExtension({ folder: dir, output: path.join(dir, 'x.canvext') }))
      .rejects.toThrow(/manifest/i)
  })

  it('skips node_modules, .git, hidden files, and .test.* files', async () => {
    await writeValidExtension(dir)
    await mkdir(path.join(dir, 'node_modules', 'leftpad'), { recursive: true })
    await writeFile(path.join(dir, 'node_modules', 'leftpad', 'index.js'), 'x')
    await mkdir(path.join(dir, '.git'), { recursive: true })
    await writeFile(path.join(dir, '.git', 'HEAD'), 'x')
    await writeFile(path.join(dir, '.env'), 'SECRET=1')
    await writeFile(path.join(dir, 'foo.test.js'), 'x')
    const out = path.join(dir, 'pack-fixture-1.0.0.canvext')
    await packExtension({ folder: dir, output: out })
    const zip = new AdmZip(out)
    const names = zip.getEntries().map((e) => e.entryName)
    expect(names.find((n) => n.startsWith('node_modules'))).toBeUndefined()
    expect(names.find((n) => n.startsWith('.git'))).toBeUndefined()
    expect(names).not.toContain('.env')
    expect(names).not.toContain('foo.test.js')
  })

  it('refuses to pack if any single entry exceeds 50 MB', async () => {
    await writeValidExtension(dir)
    const big = path.join(dir, 'big.bin')
    const fh = await (await import('node:fs/promises')).open(big, 'w')
    try { await fh.truncate(51 * 1024 * 1024) } finally { await fh.close() }
    await expect(packExtension({ folder: dir, output: path.join(dir, 'x.canvext') }))
      .rejects.toThrow(/too large/i)
  })
})
