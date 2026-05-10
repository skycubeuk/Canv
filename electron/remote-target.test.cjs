const { parseTarget, resolveTarget } = require('./remote-target.cjs')

describe('parseTarget', () => {
  it('parses user@host:port:/path', () => {
    expect(parseTarget('me@dev:2200:/srv/x')).toEqual({
      user: 'me', host: 'dev', port: 2200, path: '/srv/x',
    })
  })
  it('parses host:/path with no user or port', () => {
    expect(parseTarget('dev:/home/me/code')).toEqual({
      user: null, host: 'dev', port: null, path: '/home/me/code',
    })
  })
  it('parses user@host:/path', () => {
    expect(parseTarget('me@dev:/x')).toEqual({
      user: 'me', host: 'dev', port: null, path: '/x',
    })
  })
  it('rejects missing path', () => {
    expect(() => parseTarget('dev')).toThrow(/path/)
  })
  it('rejects relative path', () => {
    expect(() => parseTarget('dev:relative')).toThrow(/absolute/)
  })
  it('rejects empty input', () => {
    expect(() => parseTarget('')).toThrow()
  })
})

describe('resolveTarget', () => {
  const fakeConfig = (host) => {
    if (host === 'dev') return { HostName: '198.51.100.7', User: 'alice', Port: '2200', IdentityFile: '~/.ssh/id_test' }
    return null
  }
  it('fills user/port/host from ssh-config when missing', () => {
    const t = parseTarget('dev:/x')
    expect(resolveTarget(t, fakeConfig)).toEqual({
      user: 'alice', host: '198.51.100.7', port: 2200, path: '/x',
      identityFile: '~/.ssh/id_test',
    })
  })
  it('does not override explicit user/port', () => {
    const t = parseTarget('bob@dev:2300:/x')
    expect(resolveTarget(t, fakeConfig)).toEqual({
      user: 'bob', host: '198.51.100.7', port: 2300, path: '/x',
      identityFile: '~/.ssh/id_test',
    })
  })
  it('uses USER env when no ssh-config and no explicit user', () => {
    const t = parseTarget('plain:/x')
    const saved = process.env.USER
    process.env.USER = 'env-user'
    try {
      expect(resolveTarget(t, () => null).user).toBe('env-user')
    } finally {
      if (saved === undefined) delete process.env.USER
      else process.env.USER = saved
    }
  })
})
