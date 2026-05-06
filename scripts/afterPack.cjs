/**
 * electron-builder afterPack hook.
 *
 * Workaround for an electron-builder packaging bug where transitive
 * dependencies are sometimes only included nested under one parent
 * package, breaking Node's resolution when a sibling package needs them.
 *
 * Specifically: `call-bind-apply-helpers` is required by `dunder-proto`
 * (via the `isomorphic-git → sha.js → typed-array-buffer → call-bound →
 * get-intrinsic → get-proto → dunder-proto` chain), but electron-builder
 * only places it under `call-bind/node_modules/`. Node's resolver walking
 * up from `dunder-proto` doesn't find it there.
 *
 * Fix: re-extract the asar, inject the missing module at the expected
 * top-level path from the project's own `node_modules/`, then repack.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const cp = require('node:child_process')

// Add to this list if other transitive deps go missing for the same reason.
const MISSING_TOPLEVEL = ['call-bind-apply-helpers']

exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context
  const projectDir = packager.info.projectDir
  const productName = packager.appInfo.productFilename
  const asarPath = electronPlatformName === 'darwin'
    ? path.join(appOutDir, `${productName}.app`, 'Contents', 'Resources', 'app.asar')
    : path.join(appOutDir, 'resources', 'app.asar')

  if (!fs.existsSync(asarPath)) {
    console.log('[afterPack] no app.asar at', asarPath, '— skipping')
    return
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-afterpack-'))
  try {
    cp.execFileSync('npx', ['asar', 'extract', asarPath, tempDir], { stdio: 'inherit' })

    let injected = 0
    for (const name of MISSING_TOPLEVEL) {
      const dest = path.join(tempDir, 'node_modules', name)
      if (fs.existsSync(dest)) continue
      const src = path.join(projectDir, 'node_modules', name)
      if (!fs.existsSync(src)) {
        console.warn(`[afterPack] source missing: ${src}`)
        continue
      }
      fs.cpSync(src, dest, { recursive: true })
      console.log(`[afterPack] injected: node_modules/${name}`)
      injected++
    }

    if (injected === 0) {
      console.log('[afterPack] nothing to inject')
      return
    }

    fs.unlinkSync(asarPath)
    cp.execFileSync('npx', ['asar', 'pack', tempDir, asarPath], { stdio: 'inherit' })
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
