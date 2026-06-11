// Run via: `node scripts/ci-summary.mjs` (no shebang — keeps the file safe to
// import from a .cjs vitest suite on Windows, same as release-notes.mjs).
// Prints a markdown job summary for CI: coverage table (from vitest's
// json-summary reporter) and renderer bundle size (from dist/). ci.yml pipes
// this into $GITHUB_STEP_SUMMARY on the Ubuntu leg.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function dirSize(dir) {
  let total = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    total += e.isDirectory() ? dirSize(p) : statSync(p).size
  }
  return total
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${n} B`
}

const out = []

const covPath = 'coverage/coverage-summary.json'
if (existsSync(covPath)) {
  const { total } = JSON.parse(readFileSync(covPath, 'utf8'))
  out.push('## Coverage')
  out.push('')
  out.push('| Metric | Covered | Total | % |')
  out.push('|---|---:|---:|---:|')
  for (const key of ['lines', 'statements', 'functions', 'branches']) {
    const m = total[key]
    out.push(`| ${key} | ${m.covered} | ${m.total} | ${m.pct}% |`)
  }
  out.push('')
}

if (existsSync('dist')) {
  out.push('## Renderer bundle (dist/)')
  out.push('')
  out.push('| Path | Size |')
  out.push('|---|---:|')
  const entries = readdirSync('dist', { withFileTypes: true })
    .map((e) => {
      const p = join('dist', e.name)
      return { name: e.name + (e.isDirectory() ? '/' : ''), size: e.isDirectory() ? dirSize(p) : statSync(p).size }
    })
    .sort((a, b) => b.size - a.size)
  for (const e of entries) out.push(`| ${e.name} | ${fmtBytes(e.size)} |`)
  out.push(`| **total** | **${fmtBytes(entries.reduce((s, e) => s + e.size, 0))}** |`)
  out.push('')
}

if (out.length === 0) out.push('_No coverage or dist output found._')
process.stdout.write(out.join('\n') + '\n')
