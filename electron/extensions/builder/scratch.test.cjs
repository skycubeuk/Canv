const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createSession, listSessions, loadSession, writeIteration, appendHistory, deleteSession, pruneOldSessions } = require('./scratch.cjs')

function mkBase() { return fs.mkdtempSync(path.join(os.tmpdir(), 'canv-scratch-')) }

describe('scratch session management', () => {
  it('createSession creates dir + session.json with unique id', () => {
    const base = mkBase()
    const s1 = createSession(base)
    const s2 = createSession(base)
    expect(s1.id).not.toBe(s2.id)
    expect(fs.existsSync(path.join(s1.dir, 'session.json'))).toBe(true)
    const sj = JSON.parse(fs.readFileSync(path.join(s1.dir, 'session.json'), 'utf-8'))
    expect(sj.id).toBe(s1.id)
    expect(sj.history).toEqual([])
  })

  it('createSession with editingExtensionId stores it', () => {
    const base = mkBase()
    const s = createSession(base, { editingExtensionId: 'word-count' })
    const sj = JSON.parse(fs.readFileSync(path.join(s.dir, 'session.json'), 'utf-8'))
    expect(sj.editingExtensionId).toBe('word-count')
  })

  it('writeIteration writes manifest.json + files; clears stale files', () => {
    const base = mkBase()
    const { dir } = createSession(base)
    writeIteration(dir, {
      manifest: { id: 'x', name: 'X', version: '1.0.0', capabilities: [], contributions: [{ type: 'panel', id: 'main', title: 'X', icon: 'info', location: 'right-sidebar', entry: 'panels/main.html' }] },
      files: { 'panels/main.html': '<p>hi</p>', 'panels/main.js': 'console.log(1)' },
    })
    expect(fs.readFileSync(path.join(dir, 'panels/main.html'), 'utf-8')).toBe('<p>hi</p>')
    expect(fs.readFileSync(path.join(dir, 'panels/main.js'), 'utf-8')).toBe('console.log(1)')
    // Second iteration drops the .js file:
    writeIteration(dir, {
      manifest: { id: 'x', name: 'X', version: '1.0.1', capabilities: [], contributions: [{ type: 'panel', id: 'main', title: 'X', icon: 'info', location: 'right-sidebar', entry: 'panels/main.html' }] },
      files: { 'panels/main.html': '<p>bye</p>' },
    })
    expect(fs.readFileSync(path.join(dir, 'panels/main.html'), 'utf-8')).toBe('<p>bye</p>')
    expect(fs.existsSync(path.join(dir, 'panels/main.js'))).toBe(false)
  })

  it('writeIteration preserves session.json', () => {
    const base = mkBase()
    const { dir } = createSession(base)
    appendHistory(dir, { role: 'user', content: 'hi' })
    writeIteration(dir, { manifest: { id: 'x', name: 'X', version: '1.0.0', capabilities: [], contributions: [] }, files: {} })
    const sj = JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf-8'))
    expect(sj.history).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('appendHistory appends to existing history', () => {
    const base = mkBase()
    const { id, dir } = createSession(base)
    appendHistory(dir, { role: 'user', content: 'a' })
    appendHistory(dir, { role: 'assistant', content: 'b' })
    const s = loadSession(base, id)
    expect(s.history).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ])
  })

  it('loadSession returns null for unknown id', () => {
    expect(loadSession(mkBase(), 'nope')).toBe(null)
  })

  it('listSessions returns sessions sorted newest first', () => {
    const base = mkBase()
    const s1 = createSession(base)
    fs.utimesSync(path.join(s1.dir, 'session.json'), new Date(2020, 0, 1), new Date(2020, 0, 1))
    const s2 = createSession(base)
    const list = listSessions(base)
    expect(list[0].id).toBe(s2.id)
    expect(list[1].id).toBe(s1.id)
  })

  it('deleteSession removes dir', () => {
    const base = mkBase()
    const { id, dir } = createSession(base)
    deleteSession(base, id)
    expect(fs.existsSync(dir)).toBe(false)
  })

  it('pruneOldSessions keeps N most recent by mtime', () => {
    const base = mkBase()
    const sessions = []
    for (let i = 0; i < 5; i++) {
      const s = createSession(base)
      const t = new Date(2020, 0, i + 1)
      fs.utimesSync(path.join(s.dir, 'session.json'), t, t)
      sessions.push(s)
    }
    pruneOldSessions(base, 2)
    expect(fs.existsSync(sessions[0].dir)).toBe(false)
    expect(fs.existsSync(sessions[1].dir)).toBe(false)
    expect(fs.existsSync(sessions[2].dir)).toBe(false)
    expect(fs.existsSync(sessions[3].dir)).toBe(true)
    expect(fs.existsSync(sessions[4].dir)).toBe(true)
  })
})
