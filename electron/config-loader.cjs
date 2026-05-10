const fs = require('node:fs')
const path = require('node:path')

const BUILTIN_NAMES = ['fiction.yaml', 'factual.yaml', 'technical.yaml']
const DEFAULTS_DIR = path.join(__dirname, 'defaults')

/**
 * Reads (and seeds, if missing) the user's mode config folder.
 *
 * @param {{ userDataDir: string }} opts - normally Electron's `app.getPath('userData')`.
 * @returns {{ configDir: string, files: { file: string, absPath: string, content: string }[] }}
 */
function loadConfigDir({ userDataDir }) {
  const configDir = path.join(userDataDir, 'config')
  fs.mkdirSync(configDir, { recursive: true })

  // Re-seed missing built-ins.
  for (const name of BUILTIN_NAMES) {
    const dest = path.join(configDir, name)
    if (!fs.existsSync(dest)) {
      const src = path.join(DEFAULTS_DIR, name)
      fs.copyFileSync(src, dest)
    }
  }

  // Glob *.yaml (top-level only — no recursion).
  const entries = fs.readdirSync(configDir, { withFileTypes: true })
  const files = []
  for (const ent of entries) {
    if (!ent.isFile()) continue
    if (ent.name.startsWith('.')) continue
    if (!ent.name.endsWith('.yaml')) continue
    const absPath = path.join(configDir, ent.name)
    const content = fs.readFileSync(absPath, 'utf-8')
    files.push({ file: ent.name, absPath, content })
  }
  files.sort((a, b) => a.file.localeCompare(b.file))

  return { configDir, files }
}

module.exports = { loadConfigDir, BUILTIN_NAMES }
