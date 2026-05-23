'use strict'
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const AdmZip = require('adm-zip')
const { __test__ } = require('./index.cjs')
const { unpackCanvext } = __test__

describe('unpackCanvext', () => {
  let tmp
  beforeEach(async () => { tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'unpack-')) })
  afterEach(async () => { await fsp.rm(tmp, { recursive: true, force: true }) })

  it('extracts a normal canvext', () => {
    const zip = new AdmZip()
    zip.addFile('manifest.json', Buffer.from('{}'))
    zip.addFile('index.html', Buffer.from('<x/>'))
    const src = path.join(tmp, 'x.canvext')
    zip.writeZip(src)
    const dest = path.join(tmp, 'out')
    fs.mkdirSync(dest, { recursive: true })
    unpackCanvext(src, dest)
    expect(fs.existsSync(path.join(dest, 'manifest.json'))).toBe(true)
    expect(fs.existsSync(path.join(dest, 'index.html'))).toBe(true)
  })

  it('refuses a zip-slip entry', () => {
    const zip = new AdmZip()
    zip.addFile('placeholder.txt', Buffer.from('x'))
    // adm-zip normalizes leading `..` on addFile; assign after to write a
    // genuinely malicious entryName into the archive.
    zip.getEntries()[0].entryName = '../escape.txt'
    const src = path.join(tmp, 'bad.canvext')
    zip.writeZip(src)
    const dest = path.join(tmp, 'out')
    fs.mkdirSync(dest, { recursive: true })
    expect(() => unpackCanvext(src, dest)).toThrow(/escaping destDir/)
  })
})
