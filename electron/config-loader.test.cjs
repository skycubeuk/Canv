// describe/it/expect/beforeEach/afterEach are injected by vitest globals
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const { loadConfigDir } = require('./config-loader.cjs')

let tmp
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-config-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('loadConfigDir', () => {
  it('seeds the three built-in files on first run', () => {
    const result = loadConfigDir({ userDataDir: tmp })
    expect(fs.existsSync(path.join(tmp, 'config', 'fiction.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'config', 'factual.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(tmp, 'config', 'technical.yaml'))).toBe(true)
    expect(result.files.map((f) => f.file).sort()).toEqual([
      'factual.yaml', 'fiction.yaml', 'technical.yaml',
    ])
  })

  it('does not overwrite an edited built-in', () => {
    loadConfigDir({ userDataDir: tmp })
    const fictionPath = path.join(tmp, 'config', 'fiction.yaml')
    fs.writeFileSync(fictionPath, '# edited by user\n' + fs.readFileSync(fictionPath, 'utf-8'))
    const result = loadConfigDir({ userDataDir: tmp })
    const fiction = result.files.find((f) => f.file === 'fiction.yaml')
    expect(fiction.content.startsWith('# edited by user')).toBe(true)
  })

  it('re-seeds a deleted built-in', () => {
    loadConfigDir({ userDataDir: tmp })
    fs.unlinkSync(path.join(tmp, 'config', 'factual.yaml'))
    const result = loadConfigDir({ userDataDir: tmp })
    expect(fs.existsSync(path.join(tmp, 'config', 'factual.yaml'))).toBe(true)
    expect(result.files.find((f) => f.file === 'factual.yaml')).toBeDefined()
  })

  it('discovers user-added yaml files', () => {
    loadConfigDir({ userDataDir: tmp })
    fs.writeFileSync(path.join(tmp, 'config', 'mystery.yaml'), 'id: mystery\n')
    const result = loadConfigDir({ userDataDir: tmp })
    expect(result.files.map((f) => f.file).sort()).toEqual([
      'factual.yaml', 'fiction.yaml', 'mystery.yaml', 'technical.yaml',
    ])
  })

  it('ignores non-yaml files in the config dir', () => {
    loadConfigDir({ userDataDir: tmp })
    fs.writeFileSync(path.join(tmp, 'config', 'notes.txt'), 'hello')
    fs.writeFileSync(path.join(tmp, 'config', '.DS_Store'), '')
    const result = loadConfigDir({ userDataDir: tmp })
    expect(result.files.map((f) => f.file).sort()).toEqual([
      'factual.yaml', 'fiction.yaml', 'technical.yaml',
    ])
  })

  it('ignores hidden dotfiles even if they end with .yaml', () => {
    loadConfigDir({ userDataDir: tmp })
    fs.writeFileSync(path.join(tmp, 'config', '.broken.yaml'), 'id: broken')
    fs.writeFileSync(path.join(tmp, 'config', '.#lockfile.yaml'), 'lock')
    const result = loadConfigDir({ userDataDir: tmp })
    expect(result.files.map((f) => f.file).sort()).toEqual([
      'factual.yaml', 'fiction.yaml', 'technical.yaml',
    ])
  })

  it('returns absolute paths alongside content', () => {
    const result = loadConfigDir({ userDataDir: tmp })
    for (const f of result.files) {
      expect(f.absPath).toBe(path.join(tmp, 'config', f.file))
    }
  })
})
