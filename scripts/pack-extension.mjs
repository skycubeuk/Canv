// Run via: `node scripts/pack-extension.mjs <folder> [-o <output.canvext>]`.
// No shebang on purpose: Node strips shebangs from the top-level entry script
// but, on some Windows Node versions, NOT from .mjs files loaded via dynamic
// import() — leaving `#` as the first character throws
// "SyntaxError: Invalid or unexpected token" with no line/column when the
// vitest test does `await import('./pack-extension.mjs')`. Stay shebang-free.
import { readFile, stat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'

const MAX_ENTRY_BYTES = 50 * 1024 * 1024  // 50 MB per entry; refuse zip bombs.

const SKIP_DIRS = new Set(['node_modules', '.git'])
const SKIP_FILE_RE = /(^\.|\.test\.[a-zA-Z0-9]+$)/   // hidden files OR *.test.*

async function loadValidator() {
  // manifest-schema.cjs is CJS -- dynamic-imported from this ESM script.
  const mod = await import(pathToFileURL(path.resolve('electron/extensions/manifest-schema.cjs')).href)
  return mod.validateManifest
}

async function* walk(root, rel = '') {
  const entries = await readdir(path.join(root, rel), { withFileTypes: true })
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      yield* walk(root, childRel)
    } else if (e.isFile()) {
      if (SKIP_FILE_RE.test(e.name)) continue
      yield childRel
    }
  }
}

export async function packExtension({ folder, output }) {
  const manifestPath = path.join(folder, 'manifest.json')
  let raw
  try { raw = JSON.parse(await readFile(manifestPath, 'utf-8')) }
  catch (e) { throw new Error(`manifest read/parse failed: ${e.message}`) }

  const validate = await loadValidator()
  const v = validate(raw)
  if (!v.ok) throw new Error(`manifest invalid: ${v.errors.join('; ')}`)

  const zip = new AdmZip()
  for await (const rel of walk(folder)) {
    const abs = path.join(folder, rel)
    const s = await stat(abs)
    if (s.size > MAX_ENTRY_BYTES) {
      throw new Error(`entry "${rel}" is ${s.size} bytes -- too large (max ${MAX_ENTRY_BYTES})`)
    }
    zip.addLocalFile(abs, path.dirname(rel) === '.' ? '' : path.dirname(rel))
  }

  await new Promise((resolve, reject) => {
    zip.writeZip(output, (err) => err ? reject(err) : resolve())
  })

  return { output, entryCount: zip.getEntryCount() }
}

// CLI entry
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const folder = args[0]
  if (!folder) {
    console.error('usage: node scripts/pack-extension.mjs <folder> [-o <output.canvext>]')
    process.exit(2)
  }
  const oIx = args.indexOf('-o')
  const explicitOut = oIx >= 0 ? args[oIx + 1] : null
  ;(async () => {
    const raw = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf-8'))
    const output = explicitOut
      ?? path.join(folder, '..', `${raw.id}-${raw.version}.canvext`)
    const r = await packExtension({ folder, output })
    console.log(`wrote ${r.output} (${r.entryCount} entries)`)
  })().catch((e) => { console.error(e.message); process.exit(1) })
}
