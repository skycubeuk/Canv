const { Server } = require('ssh2')
const crypto = require('node:crypto')
const { generateKeyPairSync } = crypto
const { SshPool, parseKnownHosts } = require('./ssh-pool.cjs')

function hashedLine(hostString, keyBody) {
  const salt = crypto.randomBytes(20)
  const hash = crypto.createHmac('sha1', salt).update(hostString).digest('base64')
  return `|1|${salt.toString('base64')}|${hash} ssh-rsa ${keyBody}`
}

let server
let port
let hostKey

function pem() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return privateKey.export({ type: 'pkcs1', format: 'pem' })
}

beforeAll(() => {
  hostKey = pem()
  return new Promise((resolve) => {
    server = new Server({ hostKeys: [hostKey] }, (client) => {
      client.on('authentication', (ctx) => ctx.accept())
      client.on('ready', () => {
        client.on('session', (accept) => {
          const session = accept()
          session.once('exec', (acc, _r, info) => {
            const stream = acc()
            stream.write(`echo:${info.command}\n`)
            stream.exit(0)
            stream.end()
          })
        })
      })
    })
    server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve() })
  })
})
afterAll(() => server.close())

describe('SshPool', () => {
  it('connects with password auth and runs exec', async () => {
    const pool = new SshPool({ host: '127.0.0.1', port, user: 'u', auth: { password: 'p' }, hostVerifier: () => true })
    const r = await pool.exec('hello')
    expect(r.code).toBe(0)
    expect(r.stdout).toBe('echo:hello\n')
    await pool.close()
  })
  it('emits disconnect when server drops the connection', async () => {
    const pool = new SshPool({ host: '127.0.0.1', port, user: 'u', auth: { password: 'p' }, hostVerifier: () => true })
    await pool.exec('warmup')
    const seen = new Promise((res) => pool.once('disconnect', res))
    pool._client.end()
    await seen
    await pool.close()
  })
  it('rejects when host is unreachable', async () => {
    const pool = new SshPool({ host: '127.0.0.1', port: 1, user: 'u', auth: { password: 'p' }, connectTimeoutMs: 500, hostVerifier: () => true })
    await expect(pool.exec('x')).rejects.toThrow()
    await pool.close()
  })
  it('cleans up if close() is called mid-connect', async () => {
    const pool = new SshPool({ host: '127.0.0.1', port, user: 'u', auth: { password: 'p' }, hostVerifier: () => true })
    const exec = pool.exec('warmup')          // kicks off connect
    const closing = pool.close()              // close while connect is still pending
    await closing
    await exec.catch(() => {})                // exec may resolve or reject; either is fine
    expect(pool._client).toBeNull()
  })
})

describe('parseKnownHosts', () => {
  it('matches a host on default port', () => {
    const text = 'github.com ssh-rsa AAAA1234'
    expect(parseKnownHosts(text, 'github.com', 22)).toEqual(['AAAA1234'])
  })
  it('matches host:port for non-default port', () => {
    const text = '[dev]:2200 ssh-rsa AAAA9999'
    expect(parseKnownHosts(text, 'dev', 2200)).toEqual(['AAAA9999'])
  })
  it('returns [] for missing host', () => {
    expect(parseKnownHosts('foo ssh-rsa BBB', 'bar', 22)).toEqual([])
  })
  it('matches a hashed entry on default port', () => {
    const text = hashedLine('example.com', 'HHH1')
    expect(parseKnownHosts(text, 'example.com', 22)).toEqual(['HHH1'])
  })
  it('matches a hashed entry on a non-default port', () => {
    const text = hashedLine('[dev]:2200', 'HHH2')
    expect(parseKnownHosts(text, 'dev', 2200)).toEqual(['HHH2'])
  })
  it('returns [] for a hashed entry that does not match the host', () => {
    const text = hashedLine('other.example.com', 'HHH3')
    expect(parseKnownHosts(text, 'example.com', 22)).toEqual([])
  })
  it('ignores malformed hashed entries instead of throwing', () => {
    expect(parseKnownHosts('|1|garbage ssh-rsa CCC', 'anything', 22)).toEqual([])
  })
})

describe('SshPool reconnect', () => {
  it('reconnects after the server drops the connection', async () => {
    const pool = new SshPool({
      host: '127.0.0.1', port, user: 'u', auth: { password: 'p' },
      backoffMs: [50, 100], hostVerifier: () => true,
    })
    await pool.exec('first')
    const reconnected = new Promise((res) => pool.once('connected', res))
    pool._client.end()
    await reconnected
    const r = await pool.exec('second')
    expect(r.stdout).toContain('echo:second')
    await pool.close()
  })
})
