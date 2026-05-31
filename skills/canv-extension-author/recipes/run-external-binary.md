# Recipe: run-external-binary (notes-to-pdf)

Run an external command-line tool from an extension and write its output back into the workspace.
Worked example: **export a book's annotations to an annotated PDF** by shelling out to `pandoc`.

This is the canonical use of the **elevated** `process` + `workspace.write` capabilities. The user
sees exactly which binaries the extension may run (and where it may write) in the install consent
modal, so keep both allowlists minimal.

## What it does

A `command` (also surfaced as a file-tree context-menu item on folders) that:
1. reads every chapter `.md` in the chosen folder and its annotation sidecars
   (`.canv/annotations/<chapter>.json` — readable via `workspace.readText`),
2. builds a pandoc-ready source string, writing it under `Feedback/`,
3. runs `pandoc … --pdf-engine=xelatex` via `canv.process.exec`, and
4. reports success/failure with `canv.ui.notify`.

## Files

```
notes-to-pdf/
  manifest.json
  commands/export.js     # the command entry — registers canv.commands.onInvoke
```

## Manifest

`notes-to-pdf/manifest.json` — note `contributions` is a flat array of typed entries, and the two
allowlists (`executables`, `writePaths`) accompany the elevated capabilities.

```json
{
  "id": "notes-to-pdf",
  "name": "Notes to PDF",
  "version": "1.0.0",
  "description": "Exports a book's annotations to an annotated PDF. Runs pandoc on your machine.",
  "engines": { "canv": "^1.0.0" },
  "capabilities": ["workspace.list", "workspace.read", "workspace.write", "process", "notify", "ui"],
  "executables": ["pandoc"],
  "writePaths": ["Feedback/"],
  "contributions": [
    { "type": "command", "id": "notesToPdf.export", "title": "Export notes to PDF", "entry": "commands/export.js" },
    { "type": "menu", "menu": "fileTree.context", "command": "notesToPdf.export", "title": "Export notes to PDF", "when": "isDir" }
  ]
}
```

## Command JS — the exec + write pattern

`notes-to-pdf/commands/export.js`

```js
// Escape text for inclusion inside a LaTeX command argument.
function tex(s) {
  return s.replace(/([\\{}$&#%_^~])/g, '\\$1')
}

canv.commands.onInvoke(async (_id, args) => {
  // fileTree.context passes [relDir]; fall back to the active doc's folder.
  const folder = (args && args[0]) || ((await canv.activeDoc.getPath()) || '').replace(/[^/]+$/, '')
  const chapters = (await canv.workspace.list(`${folder}/**/*.md`)).sort()
  if (chapters.length === 0) { await canv.ui.notify('No chapters found', 'warning'); return }

  const parts = []
  for (const rel of chapters) {
    const prose = await canv.workspace.readText(rel)
    let notes = []
    try { notes = JSON.parse(await canv.workspace.readText(`.canv/annotations/${rel}.json`)) } catch { /* no sidecar */ }
    let body = prose
    for (const n of notes) {
      // Wrap the quoted span in a real PDF annotation (highlight + popup).
      const note = n.suggestedReplacement ? `${n.note}\n\nSuggested: ${n.suggestedReplacement}` : n.note
      const wrapped = '`\\pdfmarkupcomment[author=' + tex(n.author || 'Reviewer') + ']{' + tex(note) + '}{' + tex(n.anchor.quote) + '}`{=latex}'
      body = body.replace(n.anchor.quote, wrapped)  // anchor disambiguation omitted for brevity
    }
    parts.push(`# ${rel.split('/').pop().replace(/\.md$/, '')}\n\n${body}`)
  }

  await canv.workspace.writeText('Feedback/_preamble.tex', '\\usepackage{pdfcomment}\n')
  await canv.workspace.writeText('Feedback/_notes-build.md', parts.join('\n\n\\newpage\n\n'))

  const out = `Feedback/${folder.split('/').pop()} — notes.pdf`
  const r = await canv.process.exec('pandoc', [
    'Feedback/_notes-build.md', '-o', out,
    '--pdf-engine=xelatex', '--include-in-header=Feedback/_preamble.tex',
  ])
  if (r.exitCode === 0) await canv.ui.notify(`Exported ${out}`, 'success')
  else await canv.ui.notify(`Export failed: ${r.stderr || r.error}`, 'error')
})
```

## Known gotchas

- **`process` is the most powerful capability.** Declare the smallest `executables` allowlist that
  works (here just `pandoc` — pandoc spawns `xelatex` itself, so you do NOT list `xelatex`). The
  install modal shows the user every binary listed.
- **No shell.** `canv.process.exec` uses `execFile`: `args` is an array passed verbatim, with no
  shell interpolation, pipes, globbing, or `&&`. Chain steps by writing intermediate files
  (`workspace.writeText`) and making multiple `exec` calls.
- **Non-zero exit does not throw.** Inspect `r.exitCode` / `r.stderr`; a missing binary resolves with
  `exitCode: 1` and an `error` field. Surface `stderr` so the user sees pandoc/LaTeX diagnostics.
- **Writes are sandboxed.** `writeText` only succeeds under a `manifest.writePaths` prefix and inside
  the workspace. pandoc's own output write is NOT sandboxed by Canv — pass relative output paths so
  it lands in the workspace (cwd is the workspace root).
- **Anchor matching:** a naïve `String.replace(quote)` hits the first occurrence only. For real use,
  disambiguate repeated quotes with the sidecar's `anchor.prefix`/`anchor.suffix`, and skip anchors
  whose quote no longer resolves (mirrors the app's own behaviour).
```
