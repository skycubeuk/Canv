# Recipe: run-external-binary (notes-to-pdf)

Run external command-line tools from an extension and write their output back into the workspace.
Worked example: **export a book folder's annotations to a single PDF whose notes are real highlight +
popup comments** (visible in any PDF reader, no special software).

This is the canonical use of the **elevated** `process` + `workspace.write` capabilities. The user
sees exactly which binaries the extension may run, and where it may write, in the install consent
modal — so keep both allowlists minimal.

## Pipeline

Pure-LaTeX comment packages (e.g. `pdfcomment`) are unreliable across TeX installs, so use a robust
two-tool pipeline from binaries that are commonly present:

1. **pandoc** renders the concatenated chapters to a *prose* PDF (no annotations yet). Pass
   `-f markdown-smart` to disable smart typography, so the rendered text matches the stored quote
   characters exactly.
2. **mutool** (MuPDF's CLI, via `mutool run` JavaScript) opens that PDF, **searches** for each quoted
   span, and attaches a `Highlight` annotation carrying the note as its popup contents. MuPDF computes
   the geometry from the search hit — no coordinate maths or LaTeX wrapping required.

So `executables` is `["pandoc", "mutool"]` (pandoc internally spawns its PDF engine; you do not list
that engine separately).

## Files

```
notes-to-pdf/
  manifest.json
  commands/export.js     # the command entry — registers canv.commands.onInvoke
```

## Manifest

`contributions` is a flat array of typed entries. **Command ids must be all-lowercase, dot-separated,
no hyphens** (`"notes.exportpdf"`, never `"notesToPdf.export"`). The two allowlists accompany the
elevated capabilities.

```json
{
  "id": "notes-to-pdf",
  "name": "Notes to PDF",
  "version": "1.0.0",
  "description": "Exports a book folder's annotations to a PDF with real highlight + popup comments. Runs pandoc and mutool on your machine.",
  "engines": { "canv": "^1.0.0" },
  "capabilities": ["activeDoc.read", "workspace.list", "workspace.read", "workspace.write", "process", "notify", "ui"],
  "executables": ["pandoc", "mutool"],
  "writePaths": ["Feedback/"],
  "contributions": [
    { "type": "command", "id": "notes.exportpdf", "title": "Export notes to PDF", "entry": "commands/export.js" },
    { "type": "menu", "menu": "fileTree.context", "command": "notes.exportpdf", "title": "Export notes to PDF", "when": "isDir" }
  ]
}
```

## Command JS — the exec + write pattern

`notes-to-pdf/commands/export.js` (abridged — see the shipped extension for the full version):

```js
const BUILD_DIR = 'Feedback/.notes-to-pdf-build'

// canv.workspace.list returns a TREE, not a glob list — walk it for .md files.
function collectMarkdown(node, out) {
  if (node?.kind === 'file' && node.relPath?.endsWith('.md')) out.push(node.relPath)
  for (const c of (node?.children ?? [])) collectMarkdown(c, out)
}

canv.commands.onInvoke(async (_id, args) => {
  const folder = (args && args[0]) ? String(args[0]).replace(/\/+$/, '') : '' // fileTree.context passes the dir
  const chapters = []
  collectMarkdown(await canv.workspace.list(folder), chapters)
  chapters.sort((a, b) => a.localeCompare(b))

  const parts = [], annots = []
  for (const rel of chapters) {
    parts.push(`# ${rel.split('/').pop().replace(/\.md$/, '')}\n\n${await canv.workspace.readText(rel)}`)
    let recs = []
    try { recs = JSON.parse(await canv.workspace.readText(`.canv/annotations/${rel}.json`)) } catch {}
    for (const a of recs) {
      const body = a.suggestedReplacement ? `${a.note}\n\nSuggested: ${a.suggestedReplacement}` : a.note
      annots.push({ quote: a.anchor.quote, note: `${a.author || 'Reviewer'}: ${body}` })
    }
  }

  const prosePdf = `${BUILD_DIR}/book.prose.pdf`
  const outPdf = `Feedback/${(folder.split('/').pop() || 'book')} - notes.pdf`
  await canv.workspace.writeText(`${BUILD_DIR}/book.md`, parts.join('\n\n\\newpage\n\n'))

  let r = await canv.process.exec('pandoc',
    [`${BUILD_DIR}/book.md`, '-o', prosePdf, '--pdf-engine=xelatex', '-f', 'markdown-smart'])
  if (r.exitCode !== 0) return canv.ui.notify(`pandoc failed: ${r.stderr || r.error}`, 'error')

  // Generate a mutool script with the annotations embedded; search + highlight each quote.
  const js = [
    `var doc = Document.openDocument(${JSON.stringify(prosePdf)})`,
    `var A = ${JSON.stringify(annots)}`,
    `for (var k = 0; k < A.length; k++)`,
    `  for (var i = 0; i < doc.countPages(); i++) {`,
    `    var hits = doc.loadPage(i).search(A[k].quote)`,
    `    if (hits && hits.length) {`,
    `      var an = doc.loadPage(i).createAnnotation("Highlight")`,
    `      an.setQuadPoints(hits[0]); an.setContents(A[k].note); an.update(); break`,
    `    }`,
    `  }`,
    `doc.save(${JSON.stringify(outPdf)})`,
  ].join('\n')
  await canv.workspace.writeText(`${BUILD_DIR}/annotate.js`, js)

  r = await canv.process.exec('mutool', ['run', `${BUILD_DIR}/annotate.js`])
  if (r.exitCode !== 0) return canv.ui.notify(`mutool failed: ${r.stderr || r.error}`, 'error')
  await canv.ui.notify(`Exported "${outPdf}" - ${annots.length} notes`, 'info')
})
```

## Known gotchas

- **`process` is the most powerful capability.** Declare the smallest `executables` allowlist that
  works; the install modal shows the user every binary listed.
- **No shell.** `canv.process.exec` uses `execFile`: `args` is an array passed verbatim — no shell
  interpolation, pipes, globbing, or `&&`. Chain steps by writing intermediate files with
  `canv.workspace.writeText` and making multiple `exec` calls (here: pandoc, then mutool).
- **Non-zero exit does not throw.** Inspect `r.exitCode` / `r.stderr`; a missing binary resolves with
  `exitCode: 1` and an `error` field. Surface `stderr` so the user sees the tool's own diagnostics.
- **`list` returns a tree**, not a glob list — walk `children` for `kind === 'file'`. Annotation
  sidecars live under `.canv/` (hidden from the tree) but are reachable with `readText`.
- **Smart typography:** render with `-f markdown-smart` so quote characters in the PDF match the
  sidecar text; otherwise mutool's search misses curly-quote/dash substitutions.
- **Writes are sandboxed** to `manifest.writePaths` + inside the workspace. The binaries' own output
  writes are NOT sandboxed by Canv — pass relative paths so output lands in the workspace (the exec
  working directory is the workspace root).
```
