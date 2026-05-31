'use strict'

const path = require('node:path')

// Testable factory for the two elevated host operations behind the `process` and
// `workspace.write` extension capabilities. Dependencies are injected so the
// subprocess/filesystem behaviour can be unit-tested without real I/O.
//
//   getRoot()                  -> absolute workspace root (throws if none open)
//   safeResolve(root, rel)     -> sandbox-checked absolute path (no escape/absolute)
//   fsp                        -> node:fs/promises (mkdir, writeFile)
//   execFile(bin, args, opts, cb) -> node:child_process.execFile
function createExecWrite({ getRoot, safeResolve, fsp, execFile }) {
  return {
    writeWorkspaceText: async (rel, text) => {
      if (typeof text !== 'string') throw new TypeError('text must be a string')
      const abs = safeResolve(getRoot(), rel) // same sandbox boundary as reads
      await fsp.mkdir(path.dirname(abs), { recursive: true })
      await fsp.writeFile(abs, text, 'utf-8')
    },

    // The handler has already verified the `process` capability + that `binary`
    // is in manifest.executables. Run via execFile (no shell), cwd pinned to the
    // workspace root. Never reject on a non-zero exit so the extension can read
    // the tool's own stderr.
    execAllowed: (binary, args) => new Promise((resolve) => {
      execFile(binary, args, {
        cwd: getRoot(),
        timeout: 120_000,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      }, (err, stdout, stderr) => {
        if (err) {
          resolve({
            exitCode: typeof err.code === 'number' ? err.code : 1,
            stdout: stdout || '',
            stderr: stderr || '',
            error: err.message,
          })
        } else {
          resolve({ exitCode: 0, stdout: stdout || '', stderr: stderr || '' })
        }
      })
    }),
  }
}

module.exports = { createExecWrite }
