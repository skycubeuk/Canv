'use strict'

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const registry = require('./site-registry.cjs')

let tmp
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-sites-'))
  fs.mkdirSync(path.join(tmp, '.canv', 'sites', 'tentative'), { recursive: true })
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('site-registry', () => {
  it('register: assigns id, timestamps, returns the entry', () => {
    const e = registry.register(tmp, {
      name: 'Story Timeline',
      description: 'Test',
      folder: '.canv/sites/tentative',
      entry: 'index.html',
      prompt: 'build a timeline',
      source_files: ['chapters/*.md'],
    })
    expect(e.id).toMatch(/^story-timeline-[0-9a-f]{4}$/)
    expect(typeof e.created).toBe('string')
    expect(e.created).toBe(e.updated)
    expect(e.pinned).toBe(false)
  })

  it('register: persists to .canv/site_index.yaml', () => {
    registry.register(tmp, {
      name: 'X', folder: '.canv/sites/tentative', entry: 'index.html',
      prompt: 'p', source_files: ['a.md'],
    })
    const raw = fs.readFileSync(path.join(tmp, '.canv', 'site_index.yaml'), 'utf8')
    expect(raw).toMatch(/sites:/)
    expect(raw).toMatch(/name: X/)
  })

  it('register: rejects folder outside .canv/sites/', () => {
    expect(() => registry.register(tmp, {
      name: 'Bad', folder: '../escape', entry: 'index.html',
      prompt: 'p', source_files: [],
    })).toThrow(/folder/i)
    expect(() => registry.register(tmp, {
      name: 'Bad', folder: 'chapters', entry: 'index.html',
      prompt: 'p', source_files: [],
    })).toThrow(/folder/i)
  })

  it('register: rejects missing required fields', () => {
    expect(() => registry.register(tmp, { name: 'X' })).toThrow(/required/i)
  })

  it('list/get: round-trip', () => {
    const e = registry.register(tmp, {
      name: 'X', folder: '.canv/sites/tentative', entry: 'index.html',
      prompt: 'p', source_files: ['a.md'],
    })
    expect(registry.list(tmp)).toHaveLength(1)
    expect(registry.get(tmp, e.id)).toMatchObject({ id: e.id, name: 'X' })
    expect(registry.get(tmp, 'nope')).toBeNull()
  })

  it('update: bumps updated timestamp and merges patch', async () => {
    const e = registry.register(tmp, {
      name: 'X', folder: '.canv/sites/tentative', entry: 'index.html',
      prompt: 'p', source_files: ['a.md'],
    })
    await new Promise((r) => setTimeout(r, 10))
    const u = registry.update(tmp, e.id, { description: 'changed' })
    expect(u.description).toBe('changed')
    expect(u.updated).not.toBe(e.updated)
    expect(u.created).toBe(e.created)
  })

  it('update: refuses to change id or created', () => {
    const e = registry.register(tmp, {
      name: 'X', folder: '.canv/sites/tentative', entry: 'index.html',
      prompt: 'p', source_files: ['a.md'],
    })
    expect(() => registry.update(tmp, e.id, { id: 'spoof' })).toThrow(/id/i)
    expect(() => registry.update(tmp, e.id, { created: '2000-01-01' })).toThrow(/created/i)
  })

  it('unregister: removes entry; missing id is a no-op', () => {
    const e = registry.register(tmp, {
      name: 'X', folder: '.canv/sites/tentative', entry: 'index.html',
      prompt: 'p', source_files: [],
    })
    registry.unregister(tmp, e.id)
    expect(registry.list(tmp)).toHaveLength(0)
    expect(() => registry.unregister(tmp, 'never-existed')).not.toThrow()
  })

  it('register: id collision retries deterministically', () => {
    // Stuff the file with one entry, then force same-slug+suffix collision.
    const ids = []
    for (let i = 0; i < 5; i++) {
      const e = registry.register(tmp, {
        name: 'Same', folder: '.canv/sites/tentative', entry: 'index.html',
        prompt: 'p', source_files: [],
      })
      ids.push(e.id)
    }
    expect(new Set(ids).size).toBe(5)
    ids.forEach((id) => expect(id).toMatch(/^same-[0-9a-f]{4}$/))
  })

  it('register: renames the agent folder to .canv/sites/<id>/ so id and folder match', () => {
    fs.writeFileSync(path.join(tmp, '.canv', 'sites', 'tentative', 'index.html'), '<p>hi</p>')
    const e = registry.register(tmp, {
      name: 'Timeline',
      folder: '.canv/sites/tentative',
      entry: 'index.html',
      prompt: 'p',
      source_files: [],
    })
    expect(e.folder).toBe(`.canv/sites/${e.id}`)
    expect(fs.existsSync(path.join(tmp, '.canv', 'sites', 'tentative'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, '.canv', 'sites', e.id, 'index.html'))).toBe(true)
  })

  it('readAll: malformed yaml surfaces as parser error', () => {
    fs.writeFileSync(path.join(tmp, '.canv', 'site_index.yaml'), ': not valid: [yaml')
    expect(() => registry.list(tmp)).toThrow(/parse|yaml/i)
  })
})
