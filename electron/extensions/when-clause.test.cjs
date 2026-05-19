const { matchesWhen } = require('./when-clause.cjs')

describe('matchesWhen', () => {
  it('returns true when clause is undefined or empty', () => {
    expect(matchesWhen(undefined, { relPath: 'x.md', isDir: false })).toBe(true)
    expect(matchesWhen('', { relPath: 'x.md', isDir: false })).toBe(true)
  })
  it('fileExt:.md matches markdown files', () => {
    expect(matchesWhen('fileExt:.md', { relPath: 'notes.md', isDir: false })).toBe(true)
    expect(matchesWhen('fileExt:.md', { relPath: 'notes.txt', isDir: false })).toBe(false)
  })
  it('fileExt is case-insensitive', () => {
    expect(matchesWhen('fileExt:.MD', { relPath: 'notes.md', isDir: false })).toBe(true)
    expect(matchesWhen('fileExt:.md', { relPath: 'NOTES.MD', isDir: false })).toBe(true)
  })
  it('isDir matches directories only', () => {
    expect(matchesWhen('isDir', { relPath: 'src', isDir: true })).toBe(true)
    expect(matchesWhen('isDir', { relPath: 'x.md', isDir: false })).toBe(false)
  })
  it('isFile matches files only', () => {
    expect(matchesWhen('isFile', { relPath: 'x.md', isDir: false })).toBe(true)
    expect(matchesWhen('isFile', { relPath: 'src', isDir: true })).toBe(false)
  })
  it('unknown clauses match nothing', () => {
    expect(matchesWhen('badClause', { relPath: 'x.md', isDir: false })).toBe(false)
  })
})
