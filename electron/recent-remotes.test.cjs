const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { RecentRemotes } = require('./recent-remotes.cjs')

let tmp, file
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-rr-')); file = path.join(tmp, 'recent-remotes.json') })
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('RecentRemotes', () => {
  it('returns [] when file does not exist', () => {
    expect(new RecentRemotes(file).list()).toEqual([])
  })
  it('records and lists entries with most-recent first', () => {
    const r = new RecentRemotes(file)
    r.record('a@h:/x'); r.record('b@h:/y')
    expect(r.list().map((e) => e.raw)).toEqual(['b@h:/y', 'a@h:/x'])
  })
  it('dedupes and bumps to top', () => {
    const r = new RecentRemotes(file)
    r.record('a@h:/x'); r.record('b@h:/y'); r.record('a@h:/x')
    expect(r.list().map((e) => e.raw)).toEqual(['a@h:/x', 'b@h:/y'])
  })
  it('caps at 10 entries', () => {
    const r = new RecentRemotes(file)
    for (let i = 0; i < 15; i++) r.record(`u@h:/p${i}`)
    expect(r.list().length).toBe(10)
  })
  it('survives a malformed file', () => {
    fs.writeFileSync(file, 'not json')
    const r = new RecentRemotes(file)
    expect(r.list()).toEqual([])
    r.record('a@h:/x')
    expect(r.list().map((e) => e.raw)).toEqual(['a@h:/x'])
  })
})
