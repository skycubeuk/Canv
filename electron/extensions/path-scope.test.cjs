const path = require('node:path')
const { scopeToDir, ScopeError } = require('./path-scope.cjs')

describe('scopeToDir', () => {
  const root = path.resolve('/tmp/canv-ext-scope')

  it('resolves a clean relative path under root', () => {
    expect(scopeToDir(root, 'panels/main.html')).toBe(path.join(root, 'panels', 'main.html'))
  })
  it('resolves the root itself when path is empty', () => {
    expect(scopeToDir(root, '')).toBe(root)
  })
  it('rejects parent traversal', () => {
    expect(() => scopeToDir(root, '../etc/passwd')).toThrow(ScopeError)
    expect(() => scopeToDir(root, 'a/../../x')).toThrow(ScopeError)
  })
  it('rejects absolute paths', () => {
    expect(() => scopeToDir(root, '/etc/passwd')).toThrow(ScopeError)
    expect(() => scopeToDir(root, '\\windows\\system32')).toThrow(ScopeError)
    expect(() => scopeToDir(root, 'C:\\Windows')).toThrow(ScopeError)
  })
  it('rejects NUL bytes', () => {
    expect(() => scopeToDir(root, 'foo\0bar')).toThrow(ScopeError)
  })
  it('rejects non-string input', () => {
    expect(() => scopeToDir(root, null)).toThrow(ScopeError)
    expect(() => scopeToDir(root, 42)).toThrow(ScopeError)
  })
  it('strips leading ./', () => {
    expect(scopeToDir(root, './foo.html')).toBe(path.join(root, 'foo.html'))
  })
  it('normalises backslashes to forward slashes', () => {
    expect(scopeToDir(root, 'panels\\main.html')).toBe(path.join(root, 'panels', 'main.html'))
  })
})
