const { Server } = require('ssh2')
const sftpUtils = require('ssh2').utils.sftp
const SFTP_STATUS_CODE = sftpUtils.STATUS_CODE
const SFTP_OPEN_MODE = sftpUtils.OPEN_MODE
const { generateKeyPairSync } = require('node:crypto')
const { SshPool } = require('./ssh-pool.cjs')
const { RemoteFs } = require('./remote-fs.cjs')

function makeServer(initial) {
  const files = new Map(Object.entries(initial))
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const hostKey = privateKey.export({ type: 'pkcs1', format: 'pem' })
  const handles = new Map(); let nextHandle = 1
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('authentication', (ctx) => ctx.accept())
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('sftp', (acc) => {
          const sftp = acc()
          sftp.on('OPEN', (reqid, filename, flags) => {
            const f = files.get(filename)
            const create = flags & SFTP_OPEN_MODE.CREAT
            const excl = flags & SFTP_OPEN_MODE.EXCL
            if (!f && !create) return sftp.status(reqid, SFTP_STATUS_CODE.NO_SUCH_FILE)
            if (f && create && excl) return sftp.status(reqid, SFTP_STATUS_CODE.FAILURE)
            if (!f) files.set(filename, { content: Buffer.alloc(0), mtime: Date.now(), kind: 'file' })
            const h = Buffer.from(String(nextHandle++))
            handles.set(h.toString(), { path: filename, offset: 0, write: !!(flags & SFTP_OPEN_MODE.WRITE) })
            sftp.handle(reqid, h)
          })
          sftp.on('READ', (reqid, h, offset, length) => {
            const ent = handles.get(h.toString()); const f = files.get(ent.path)
            if (offset >= f.content.length) return sftp.status(reqid, SFTP_STATUS_CODE.EOF)
            sftp.data(reqid, f.content.slice(offset, offset + length))
          })
          sftp.on('WRITE', (reqid, h, offset, data) => {
            const ent = handles.get(h.toString()); const f = files.get(ent.path)
            const next = Buffer.concat([f.content.slice(0, offset), data])
            files.set(ent.path, { ...f, content: next, mtime: Date.now() })
            sftp.status(reqid, SFTP_STATUS_CODE.OK)
          })
          sftp.on('FSTAT', (reqid, h) => {
            const ent = handles.get(h.toString()); const f = files.get(ent.path)
            sftp.attrs(reqid, { size: f.content.length, mtime: Math.floor(f.mtime / 1000), atime: Math.floor(f.mtime / 1000), mode: f.kind === 'dir' ? 0o040755 : 0o100644 })
          })
          sftp.on('STAT', (reqid, p) => {
            const f = files.get(p); if (!f) return sftp.status(reqid, SFTP_STATUS_CODE.NO_SUCH_FILE)
            sftp.attrs(reqid, { size: f.content?.length || 0, mtime: Math.floor((f.mtime || 0) / 1000), atime: Math.floor((f.mtime || 0) / 1000), mode: f.kind === 'dir' ? 0o040755 : 0o100644 })
          })
          sftp.on('LSTAT', (reqid, p) => {
            const f = files.get(p); if (!f) return sftp.status(reqid, SFTP_STATUS_CODE.NO_SUCH_FILE)
            sftp.attrs(reqid, { size: f.content?.length || 0, mtime: Math.floor((f.mtime || 0) / 1000), atime: Math.floor((f.mtime || 0) / 1000), mode: f.kind === 'dir' ? 0o040755 : 0o100644 })
          })
          sftp.on('CLOSE', (reqid, h) => { handles.delete(h.toString()); sftp.status(reqid, SFTP_STATUS_CODE.OK) })
          sftp.on('OPENDIR', (reqid, p) => {
            const h = Buffer.from('d' + nextHandle++)
            const items = [...files.entries()].filter(([k]) => k.startsWith(p + '/') && k.slice(p.length + 1).indexOf('/') === -1)
            handles.set(h.toString(), { dir: true, items, sent: false })
            sftp.handle(reqid, h)
          })
          sftp.on('READDIR', (reqid, h) => {
            const ent = handles.get(h.toString())
            if (ent.sent) return sftp.status(reqid, SFTP_STATUS_CODE.EOF)
            ent.sent = true
            sftp.name(reqid, ent.items.map(([k, v]) => ({
              filename: k.split('/').pop(),
              longname: k.split('/').pop(),
              attrs: { size: v.content?.length || 0, mtime: Math.floor((v.mtime || 0) / 1000), mode: v.kind === 'dir' ? 0o040755 : 0o100644 },
            })))
          })
          sftp.on('MKDIR', (reqid, p) => { files.set(p, { kind: 'dir', mtime: Date.now() }); sftp.status(reqid, SFTP_STATUS_CODE.OK) })
          sftp.on('RENAME', (reqid, oldP, newP) => {
            const f = files.get(oldP); if (!f) return sftp.status(reqid, SFTP_STATUS_CODE.NO_SUCH_FILE)
            files.delete(oldP); files.set(newP, f); sftp.status(reqid, SFTP_STATUS_CODE.OK)
          })
          sftp.on('REMOVE', (reqid, p) => { files.delete(p); sftp.status(reqid, SFTP_STATUS_CODE.OK) })
          sftp.on('RMDIR', (reqid, p) => { files.delete(p); sftp.status(reqid, SFTP_STATUS_CODE.OK) })
        })
      })
    })
  })
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port, files })))
}

let ctx
beforeEach(async () => {
  ctx = await makeServer({
    '/srv/x': { kind: 'dir', mtime: 1 },
    '/srv/x/a.md': { kind: 'file', content: Buffer.from('hello'), mtime: 1000 },
    '/srv/x/sub': { kind: 'dir', mtime: 1 },
    '/srv/x/sub/b.md': { kind: 'file', content: Buffer.from('two'), mtime: 2000 },
  })
})
afterEach(() => ctx.server.close())

function newFs() {
  const pool = new SshPool({ host: '127.0.0.1', port: ctx.port, user: 'u', auth: { password: 'p' }, hostVerifier: () => true })
  return { fs: new RemoteFs({ pool, rootPath: '/srv/x' }), pool }
}

describe('RemoteFs', () => {
  it('readFile returns content and mtime', async () => {
    const { fs, pool } = newFs()
    const r = await fs.readFile('a.md')
    expect(r.content).toBe('hello')
    expect(r.mtimeMs).toBe(1000)
    await pool.close()
  })
  it('writeFile updates content and bumps mtime', async () => {
    const { fs, pool } = newFs()
    const before = (await fs.readFile('a.md')).mtimeMs
    const w = await fs.writeFile('a.md', 'world')
    expect(w.mtimeMs).toBeGreaterThanOrEqual(before)
    expect((await fs.readFile('a.md')).content).toBe('world')
    await pool.close()
  })
  it('writeFile throws stale-write when expectedMtime mismatches', async () => {
    const { fs, pool } = newFs()
    await expect(fs.writeFile('a.md', 'x', 999)).rejects.toThrow(/stale/i)
    await pool.close()
  })
  it('createFile fails when file exists', async () => {
    const { fs, pool } = newFs()
    await expect(fs.createFile('a.md', 'x')).rejects.toThrow()
    await pool.close()
  })
  it('createFile creates a new file', async () => {
    const { fs, pool } = newFs()
    const w = await fs.createFile('new.md', 'fresh')
    expect(w.mtimeMs).toBeGreaterThan(0)
    expect((await fs.readFile('new.md')).content).toBe('fresh')
    await pool.close()
  })
  it('listDir returns a tree', async () => {
    const { fs, pool } = newFs()
    const tree = await fs.listDir('')
    expect(tree.kind).toBe('dir')
    const names = tree.children.map((c) => c.name).sort()
    expect(names).toContain('a.md')
    expect(names).toContain('sub')
    await pool.close()
  })
  it('rejects ../ path escape', async () => {
    const { fs, pool } = newFs()
    await expect(fs.readFile('../etc/passwd')).rejects.toThrow(/traversal/)
    await pool.close()
  })
  it('rename moves a file', async () => {
    const { fs, pool } = newFs()
    await fs.rename('a.md', 'renamed.md')
    await expect(fs.readFile('a.md')).rejects.toThrow()
    expect((await fs.readFile('renamed.md')).content).toBe('hello')
    await pool.close()
  })
  it('delete removes a file', async () => {
    const { fs, pool } = newFs()
    await fs.delete('a.md')
    await expect(fs.readFile('a.md')).rejects.toThrow()
    await pool.close()
  })
})

function mockPool(execImpl) {
  return { exec: execImpl, getSftp: async () => ({}) }
}

describe('RemoteFs.search', () => {
  it('uses rg --json when available and parses matches', async () => {
    let cmdSeen
    const rgOut = [
      JSON.stringify({ type: 'match', data: {
        path: { text: '/srv/x/a.md' },
        lines: { text: 'hello world\n' },
        line_number: 3,
        submatches: [{ start: 6, end: 11, match: { text: 'world' } }],
      } }),
      '',
    ].join('\n')
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: mockPool(async (cmd) => { cmdSeen = cmd; return { code: 0, stdout: rgOut, stderr: '' } }),
      rootPath: '/srv/x',
      preflight: { hasRg: true, hasGrep: true },
    })
    const r = await fs.search({ query: 'world', regex: false, caseSensitive: false })
    expect(cmdSeen).toMatch(/^rg /)
    expect(r.matches).toEqual([{ rel: 'a.md', line: 2, col: 6, matchLen: 5, snippet: 'hello world', snippetCol: 6 }])
    expect(r.truncated).toBe(false)
  })

  it('falls back to grep when rg unavailable', async () => {
    let cmdSeen
    const grepOut = '/srv/x/a.md:3:hello world\n'
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: mockPool(async (cmd) => { cmdSeen = cmd; return { code: 0, stdout: grepOut, stderr: '' } }),
      rootPath: '/srv/x',
      preflight: { hasRg: false, hasGrep: true },
    })
    const r = await fs.search({ query: 'world', regex: false, caseSensitive: false })
    expect(cmdSeen).toMatch(/^grep /)
    expect(r.matches.length).toBe(1)
    expect(r.matches[0].rel).toBe('a.md')
    expect(r.matches[0].line).toBe(2)
    expect(r.matches[0].snippet).toBe('hello world')
  })

  it('returns empty matches for empty query', async () => {
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: mockPool(async () => ({ code: 0, stdout: '', stderr: '' })),
      rootPath: '/srv/x',
      preflight: { hasRg: true },
    })
    expect((await fs.search({ query: '', regex: false, caseSensitive: false })).matches).toEqual([])
  })

  it('caps results at SEARCH_MAX_MATCHES', async () => {
    const lines = Array.from({ length: 1500 }, (_, i) =>
      JSON.stringify({ type: 'match', data: {
        path: { text: '/srv/x/a.md' },
        lines: { text: `hit ${i}\n` },
        line_number: i + 1,
        submatches: [{ start: 0, end: 3, match: { text: 'hit' } }],
      } })
    ).join('\n')
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: mockPool(async () => ({ code: 0, stdout: lines, stderr: '' })),
      rootPath: '/srv/x',
      preflight: { hasRg: true },
    })
    const r = await fs.search({ query: 'hit', regex: false, caseSensitive: false })
    expect(r.matches.length).toBe(1000)
    expect(r.truncated).toBe(true)
  })
})

describe('RemoteFs.gitStatus', () => {
  it('returns noRepo when git reports not-a-repository', async () => {
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: mockPool(async () => ({ code: 128, stdout: '', stderr: 'fatal: not a git repository' })),
      rootPath: '/srv/x',
    })
    const r = await fs.gitStatus()
    expect(r.noRepo).toBe(true)
    expect(r.branch).toBe(null)
    expect(r.changed).toEqual([])
  })

  it('parses porcelain v2 -z output into changed/staged/untracked', async () => {
    // Build a -z separated record set:
    // - branch.head main
    // - "1 .M N... .. .. .. .. .. file1.md"  → changed (modified, working tree)
    // - "1 M. N... .. .. .. .. .. file2.md"  → staged (modified)
    // - "? newfile.md"                       → untracked
    // - "1 A. N... .. .. .. .. .. added.md"  → staged (added)
    // - "1 .D N... .. .. .. .. .. del.md"    → changed (deleted)
    const recs = [
      '# branch.head main',
      '1 .M N... 100644 100644 100644 abc def file1.md',
      '1 M. N... 100644 100644 100644 abc def file2.md',
      '1 A. N... 000000 100644 100644 0000000 ddd added.md',
      '1 .D N... 100644 100644 100644 abc def del.md',
      '? newfile.md',
    ]
    const stdout = recs.join('\0') + '\0'
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: mockPool(async () => ({ code: 0, stdout, stderr: '' })),
      rootPath: '/srv/x',
    })
    const r = await fs.gitStatus()
    expect(r.noRepo).toBeUndefined()
    expect(r.branch).toBe('main')
    expect(r.changed.map((e) => e.relPath).sort()).toEqual(['del.md', 'file1.md'])
    expect(r.staged.map((e) => e.relPath).sort()).toEqual(['added.md', 'file2.md'])
    expect(r.untracked.map((e) => e.relPath)).toEqual(['newfile.md'])
    expect(r.changed.find((e) => e.relPath === 'file1.md').status).toBe('modified')
    expect(r.changed.find((e) => e.relPath === 'del.md').status).toBe('deleted')
    expect(r.staged.find((e) => e.relPath === 'added.md').status).toBe('added')
  })
})

describe('RemoteFs.gitDiff', () => {
  it('returns baseText from git show and currentText from readFile', async () => {
    const calls = []
    const fakeSftp = {} // unused beyond identity in this mock
    // Mock pool: exec returns the file blob; getSftp resolves; we patch readFile via spy.
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: {
        exec: async (cmd) => { calls.push(cmd); return { code: 0, stdout: 'BASE TEXT', stderr: '' } },
        getSftp: async () => fakeSftp,
      },
      rootPath: '/srv/x',
    })
    fs.readFile = async () => ({ content: 'CURRENT TEXT', mtimeMs: 0 })
    const r = await fs.gitDiff('a.md', 'HEAD')
    expect(calls[0]).toMatch(/git -C .* show 'HEAD:a\.md'/)
    expect(r).toEqual({ relPath: 'a.md', baseRef: 'HEAD', baseText: 'BASE TEXT', currentText: 'CURRENT TEXT' })
  })
  it('uses HEAD when baseRef is missing', async () => {
    const calls = []
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: { exec: async (cmd) => { calls.push(cmd); return { code: 0, stdout: '', stderr: '' } }, getSftp: async () => ({}) },
      rootPath: '/srv/x',
    })
    fs.readFile = async () => ({ content: '', mtimeMs: 0 })
    const r = await fs.gitDiff('a.md')
    expect(r.baseRef).toBe('HEAD')
    expect(calls[0]).toMatch(/HEAD:a\.md/)
  })
  it('returns empty baseText when git show fails', async () => {
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: { exec: async () => ({ code: 128, stdout: '', stderr: 'fatal: invalid object name' }), getSftp: async () => ({}) },
      rootPath: '/srv/x',
    })
    fs.readFile = async () => ({ content: 'X', mtimeMs: 0 })
    const r = await fs.gitDiff('a.md', 'HEAD')
    expect(r.baseText).toBe('')
    expect(r.currentText).toBe('X')
  })
})

const { Readable } = require('node:stream')

describe('RemoteFs.subscribe', () => {
  it('emits parsed events from spawned inotifywait stdout', async () => {
    const stream = new Readable({ read() {} })
    stream.stderr = new Readable({ read() {} })
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: { spawn: async () => stream },
      rootPath: '/srv/x',
    })
    const events = []
    const unsub = fs.subscribe((e) => events.push(e))
    stream.push('CREATE /srv/x/a.md\n')
    await new Promise((r) => setImmediate(r))
    expect(events).toEqual([{ type: 'add', relPath: 'a.md' }])
    unsub()
  })

  it('passes the inotifywait command containing root and exclude pattern', async () => {
    let cmdSeen
    const stream = new Readable({ read() {} })
    stream.stderr = new Readable({ read() {} })
    const fs = new (require('./remote-fs.cjs').RemoteFs)({
      pool: { spawn: async (cmd) => { cmdSeen = cmd; return stream } },
      rootPath: '/srv/x',
    })
    const unsub = fs.subscribe(() => {})
    await new Promise((r) => setImmediate(r))
    expect(cmdSeen).toMatch(/inotifywait/)
    expect(cmdSeen).toContain("'/srv/x'")
    expect(cmdSeen).toContain('--exclude')
    unsub()
  })
})
