'use strict'
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const dns = require('node:dns')
const http = require('node:http')
const https = require('node:https')
const AdmZip = require('adm-zip')

const { __test__ } = require('./services/extensions/index.cjs')
const { unpackCanvext } = __test__

describe('canvext install is offline-only', () => {
  let dnsSpy, httpSpy, httpsSpy

  beforeEach(() => {
    dnsSpy   = vi.spyOn(dns, 'lookup').mockImplementation(() => { throw new Error('dns blocked') })
    httpSpy  = vi.spyOn(http, 'request').mockImplementation(() => { throw new Error('http blocked') })
    httpsSpy = vi.spyOn(https, 'request').mockImplementation(() => { throw new Error('https blocked') })
    if (typeof fetch !== 'undefined') {
      vi.stubGlobal('fetch', () => { throw new Error('fetch blocked') })
    }
  })

  afterEach(() => {
    dnsSpy.mockRestore()
    httpSpy.mockRestore()
    httpsSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('unpacks a .canvext built from an existing fixture without touching the network', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cx-net-'))
    try {
      const fixture = path.resolve(__dirname, 'extensions', 'test-fixtures', 'hello-world')
      const zip = new AdmZip()
      for (const rel of ['manifest.json', 'panels/main.html']) {
        const abs = path.join(fixture, rel)
        if (fs.existsSync(abs)) zip.addFile(rel, fs.readFileSync(abs))
      }
      const out = path.join(dir, 'hello.canvext')
      zip.writeZip(out)

      const dest = path.join(dir, 'unpacked')
      fs.mkdirSync(dest, { recursive: true })
      unpackCanvext(out, dest)

      expect(fs.existsSync(path.join(dest, 'manifest.json'))).toBe(true)

      expect(dnsSpy).not.toHaveBeenCalled()
      expect(httpSpy).not.toHaveBeenCalled()
      expect(httpsSpy).not.toHaveBeenCalled()
    } finally {
      await fsp.rm(dir, { recursive: true, force: true })
    }
  })
})
