const { EventEmitter } = require('node:events')
const { Client } = require('ssh2')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')

function hashedHostMatches(hostsField, candidates) {
  // Hashed entry: |1|<base64-salt>|<base64-hash>
  // hash = HMAC-SHA1(salt_bytes, hostname_string), base64-encoded.
  const parts = hostsField.split('|')
  if (parts.length !== 4 || parts[0] !== '' || parts[1] !== '1') return false
  let salt
  try { salt = Buffer.from(parts[2], 'base64') } catch { return false }
  if (salt.length === 0) return false
  const target = parts[3]
  for (const c of candidates) {
    const computed = crypto.createHmac('sha1', salt).update(c).digest('base64')
    if (computed === target) return true
  }
  return false
}

function parseKnownHosts(text, host, port) {
  // Returns the array of base64-encoded key bodies for this host.
  // Supports plain lines ("host[,host...] keytype base64data [comment]") and
  // hashed lines ("|1|salt|hash keytype base64data") — the latter is the
  // Linux default when HashKnownHosts is enabled.
  const matches = []
  const hostPort = port && port !== 22 ? `[${host}]:${port}` : null
  const candidates = [host]
  if (hostPort) candidates.push(hostPort)
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const sp1 = line.indexOf(' ')
    if (sp1 === -1) continue
    const hostsField = line.slice(0, sp1)
    const rest = line.slice(sp1 + 1)
    const sp2 = rest.indexOf(' ')
    if (sp2 === -1) continue
    const keyBody = rest.slice(sp2 + 1).split(/\s+/)[0]
    if (hostsField.startsWith('|1|')) {
      if (hashedHostMatches(hostsField, candidates)) matches.push(keyBody)
      continue
    }
    const hosts = hostsField.split(',').map((h) => h.trim()).filter(Boolean)
    for (const h of hosts) {
      if (h === host) { matches.push(keyBody); break }
      if (hostPort && h === hostPort) { matches.push(keyBody); break }
    }
  }
  return matches
}

function makeHostVerifier(host, port) {
  return (keyBuffer) => {
    let text
    try { text = fs.readFileSync(`${os.homedir()}/.ssh/known_hosts`, 'utf8') }
    catch { return false }
    const expected = parseKnownHosts(text, host, port)
    if (expected.length === 0) return false
    const offered = keyBuffer.toString('base64')
    return expected.some((b64) => b64 === offered)
  }
}

class SshPool extends EventEmitter {
  constructor(opts) {
    super()
    this.opts = opts
    this._client = null
    this._connectPromise = null
    this._sftp = null
    this._closed = false
    this._backoff = opts.backoffMs ?? [1000, 2000, 5000, 10000, 30000]
    this._reconnectTimer = null
  }

  _connect() {
    if (this._connectPromise) return this._connectPromise
    this._connectPromise = new Promise((resolve, reject) => {
      const client = new Client()
      const onErr = (e) => { this._connectPromise = null; reject(e) }
      client.once('error', onErr)
      client.once('ready', () => {
        client.removeListener('error', onErr)
        client.on('error', (e) => this.emit('error', e))
        client.on('close', () => {
          this._client = null
          this._sftp = null
          this._connectPromise = null
          if (this._closed) return
          this.emit('disconnect')
          this._scheduleReconnect(0)
        })
        this._client = client
        resolve(client)
      })
      const cfg = {
        host: this.opts.host,
        port: this.opts.port || 22,
        username: this.opts.user,
        readyTimeout: this.opts.connectTimeoutMs ?? 15000,
        keepaliveInterval: 20000,
      }
      if (this.opts.auth?.password) cfg.password = this.opts.auth.password
      if (this.opts.auth?.privateKey) cfg.privateKey = this.opts.auth.privateKey
      if (this.opts.auth?.agent) cfg.agent = this.opts.auth.agent
      cfg.hostVerifier = this.opts.hostVerifier ?? makeHostVerifier(this.opts.host, this.opts.port || 22)
      client.connect(cfg)
    })
    return this._connectPromise
  }

  async exec(command) {
    const client = await this._connect()
    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err)
        let stdout = '', stderr = '', code = 0
        stream.on('data', (d) => { stdout += d.toString('utf8') })
        stream.stderr.on('data', (d) => { stderr += d.toString('utf8') })
        stream.on('exit', (c) => { code = c ?? 0 })
        stream.on('close', () => resolve({ stdout, stderr, code }))
        stream.on('error', reject)
      })
    })
  }

  async spawn(command) {
    const client = await this._connect()
    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err)
        resolve(stream)
      })
    })
  }

  async getSftp() {
    if (this._sftp) return this._sftp
    const client = await this._connect()
    this._sftp = await new Promise((res, rej) =>
      client.sftp((err, sftp) => err ? rej(err) : res(sftp))
    )
    return this._sftp
  }

  _scheduleReconnect(attempt) {
    if (this._closed) return
    const base = this._backoff[Math.min(attempt, this._backoff.length - 1)]
    const jitter = base * (0.8 + Math.random() * 0.4)
    this.emit('reconnecting', { attempt, delayMs: jitter })
    this._reconnectTimer = setTimeout(async () => {
      if (this._closed) return
      try {
        await this._connect()
        this.emit('connected')
      } catch {
        this._scheduleReconnect(attempt + 1)
      }
    }, jitter)
  }

  reconnectNow() {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer)
    this._scheduleReconnect(0)
  }

  async close() {
    this._closed = true
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null }
    // If a connect is in flight, wait for it to settle so we know whether
    // _client got assigned. We don't care if it failed.
    if (this._connectPromise) {
      try { await this._connectPromise } catch { /* ignore */ }
    }
    if (this._client) {
      await new Promise((res) => { this._client.once('close', res); this._client.end() })
    }
    this._client = null
    this._sftp = null
    this._connectPromise = null
  }
}

module.exports = { SshPool, parseKnownHosts }
