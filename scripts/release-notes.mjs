// Run via: `node scripts/release-notes.mjs <tag>` (no shebang — this file is
// dynamically imported by release-notes.test.cjs, and vitest's transform on
// Windows fails on `#!` with "SyntaxError: Invalid or unexpected token").
// Generates markdown release notes from the conventional commits between the
// previous tag and the given tag. release.yml uses it to fill the draft
// release body that electron-builder creates. Run locally to preview:
//   node scripts/release-notes.mjs v0.9.1
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
  ['test', 'Tests'],
  ['ci', 'CI & build'],
  ['build', 'CI & build'],
  ['chore', 'Chores'],
]

/**
 * The Downloads header every release carries. Filenames follow
 * electron-builder's fixed patterns for this project's targets, so the table
 * is derivable from the version alone. Keep in sync with package.json
 * `build` targets and the prune step in release.yml.
 */
export function downloadsHeader(version) {
  return [
    `# Canv ${version}`,
    '',
    '## Downloads',
    '',
    '| File | Platform |',
    '|---|---|',
    `| \`Canv-${version}-arm64.dmg\` | macOS (Apple Silicon) |`,
    `| \`Canv-${version}.dmg\` | macOS (Intel) |`,
    `| \`Canv-Setup-${version}.exe\` | Windows (NSIS installer) |`,
    `| \`Canv-${version}.exe\` | Windows (portable) |`,
    `| \`Canv-${version}.AppImage\` | Linux (x86_64) |`,
    `| \`canv_${version}_amd64.deb\` | Linux Debian / Ubuntu (amd64) |`,
    `| \`canv-${version}.x86_64.rpm\` | Linux Fedora / RHEL / openSUSE (x86_64) |`,
    '',
    'macOS builds are unsigned. On first launch right-click the app and choose **Open** to bypass Gatekeeper.',
  ].join('\n')
}

/**
 * Group conventional-commit subjects into a markdown document.
 * Non-conventional subjects land under "Other"; merge commits are skipped.
 */
export function buildNotes(subjects, { prevTag, tag, repoUrl } = {}) {
  const titles = [...new Set(SECTIONS.map(([, t]) => t))]
  const groups = new Map(titles.map((t) => [t, []]))
  const byType = new Map(SECTIONS)
  const other = []

  for (const s of subjects) {
    if (/^Merge /.test(s)) continue
    const m = /^(\w+)(\(([^)]*)\))?!?:\s*(.+)$/.exec(s)
    const title = m ? byType.get(m[1]) : undefined
    if (title) {
      const scope = m[3] ? `**${m[3]}**: ` : ''
      const breaking = /^\w+(\([^)]*\))?!:/.test(s) ? ' **(breaking)**' : ''
      groups.get(title).push(`- ${scope}${m[4]}${breaking}`)
    } else {
      other.push(`- ${s}`)
    }
  }

  const parts = []
  if (tag) parts.push(downloadsHeader(tag.replace(/^v/, '')))
  for (const title of titles) {
    const items = groups.get(title)
    if (items.length) parts.push(`## ${title}\n\n${items.join('\n')}`)
  }
  if (other.length) parts.push(`## Other\n\n${other.join('\n')}`)
  if (parts.length === 0) parts.push('_No changes recorded between tags._')
  if (prevTag && tag && repoUrl) {
    parts.push(`**Full changelog**: ${repoUrl}/compare/${prevTag}...${tag}`)
  }
  return parts.join('\n\n') + '\n'
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function main() {
  const tag = process.argv[2]
  if (!tag) {
    console.error('usage: release-notes.mjs <tag>')
    process.exit(1)
  }
  let prevTag = null
  try { prevTag = git('describe', '--tags', '--abbrev=0', `${tag}^`) } catch { /* first release */ }

  const range = prevTag ? `${prevTag}..${tag}` : tag
  const log = git('log', '--no-merges', '--pretty=%s', range)
  const subjects = log ? log.split('\n') : []

  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const repoUrl = (pkg.repository?.url || '')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '') || null

  process.stdout.write(buildNotes(subjects, { prevTag, tag, repoUrl }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
