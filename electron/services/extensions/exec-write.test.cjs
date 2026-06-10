const { createExecWrite } = require('./exec-write.cjs')

// safeResolve fake mirroring the real one: rejects escape/absolute, else joins.
function fakeSafeResolve(root, rel) {
  if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) throw new Error('absolute paths not allowed')
  const norm = rel.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (norm.split('/').some((s) => s === '..')) throw new Error('parent traversal not allowed')
  return `${root}/${norm}`
}

function makeFsp() {
  const calls = { mkdir: [], writeFile: [] }
  return {
    calls,
    mkdir: async (dir, opts) => { calls.mkdir.push({ dir, opts }) },
    writeFile: async (abs, text, enc) => { calls.writeFile.push({ abs, text, enc }) },
  }
}

describe('createExecWrite — writeWorkspaceText', () => {
  const base = (fsp) => createExecWrite({
    getRoot: () => '/ws', safeResolve: fakeSafeResolve, fsp, execFile: () => {},
  })

  it('writes UTF-8 under the resolved absolute path', async () => {
    const fsp = makeFsp()
    await base(fsp).writeWorkspaceText('Feedback/notes.md', 'body')
    expect(fsp.calls.writeFile).toEqual([{ abs: '/ws/Feedback/notes.md', text: 'body', enc: 'utf-8' }])
  })
  it('creates parent directories first', async () => {
    const fsp = makeFsp()
    await base(fsp).writeWorkspaceText('Feedback/sub/x.md', 'b')
    expect(fsp.calls.mkdir[0].dir).toBe('/ws/Feedback/sub')
    expect(fsp.calls.mkdir[0].opts).toEqual({ recursive: true })
  })
  it('rejects a path that escapes the workspace', async () => {
    const fsp = makeFsp()
    await expect(base(fsp).writeWorkspaceText('../escape.md', 'b')).rejects.toThrow(/traversal/i)
    expect(fsp.calls.writeFile).toHaveLength(0)
  })
  it('rejects non-string text', async () => {
    const fsp = makeFsp()
    await expect(base(fsp).writeWorkspaceText('Feedback/x.md', 42)).rejects.toThrow(/string/i)
  })
})

describe('createExecWrite — execAllowed', () => {
  function withExec(execFile) {
    return createExecWrite({ getRoot: () => '/ws', safeResolve: fakeSafeResolve, fsp: makeFsp(), execFile })
  }

  it('runs execFile with cwd pinned to the workspace root and resolves on success', async () => {
    let seen
    const execFile = (binary, args, opts, cb) => { seen = { binary, args, opts }; cb(null, 'out', '') }
    const r = await withExec(execFile).execAllowed('pandoc', ['a.md', '-o', 'a.pdf'])
    expect(seen.binary).toBe('pandoc')
    expect(seen.args).toEqual(['a.md', '-o', 'a.pdf'])
    expect(seen.opts.cwd).toBe('/ws')
    expect(r).toMatchObject({ exitCode: 0, stdout: 'out', stderr: '' })
  })
  it('resolves (does not reject) on a non-zero exit, surfacing stderr', async () => {
    const err = Object.assign(new Error('exited'), { code: 2 })
    const execFile = (_b, _a, _o, cb) => cb(err, 'partial', 'boom')
    const r = await withExec(execFile).execAllowed('pandoc', [])
    expect(r.exitCode).toBe(2)
    expect(r.stderr).toBe('boom')
    expect(r.error).toMatch(/exited/)
  })
  it('reports a spawn failure (missing binary) as exitCode 1 with an error', async () => {
    const err = Object.assign(new Error('spawn pandoc ENOENT'), { code: 'ENOENT' })
    const execFile = (_b, _a, _o, cb) => cb(err, '', '')
    const r = await withExec(execFile).execAllowed('pandoc', [])
    expect(r.exitCode).toBe(1)
    expect(r.error).toMatch(/ENOENT/)
  })
})
