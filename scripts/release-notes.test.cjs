// Tests the pure grouping logic; the git/CLI shell is exercised manually
// (node scripts/release-notes.mjs <tag>) and in release.yml.
// describe/it/expect/beforeAll come from vitest globals (see vitest.config.ts).

let buildNotes
beforeAll(async () => {
  ({ buildNotes } = await import('./release-notes.mjs'))
})

describe('buildNotes', () => {
  it('groups conventional commits into titled sections in fixed order', () => {
    const notes = buildNotes([
      'chore(skills): tidy',
      'fix(serve): confine symlinks',
      'feat(anthropic): enable prompt caching',
      'docs(skills): add recipe',
    ], {})
    const order = ['## Features', '## Fixes', '## Documentation', '## Chores']
    const positions = order.map((h) => notes.indexOf(h))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(notes).toContain('- **anthropic**: enable prompt caching')
  })

  it('renders scopes bold and flags breaking changes', () => {
    const notes = buildNotes(['feat(api)!: drop legacy endpoint'], {})
    expect(notes).toContain('- **api**: drop legacy endpoint **(breaking)**')
  })

  it('merges ci and build into one section', () => {
    const notes = buildNotes(['ci: add packaging smoke test', 'build: bump electron'], {})
    expect(notes.match(/## CI & build/g)).toHaveLength(1)
    expect(notes).toContain('- add packaging smoke test')
    expect(notes).toContain('- bump electron')
  })

  it('puts non-conventional subjects under Other and skips merge commits', () => {
    const notes = buildNotes(['gg', "Merge branch 'x'"], {})
    expect(notes).toContain('## Other\n\n- gg')
    expect(notes).not.toContain('Merge branch')
  })

  it('appends a compare link when prevTag/tag/repoUrl are known', () => {
    const notes = buildNotes(['feat: x'], {
      prevTag: 'v0.9.0', tag: 'v0.9.1', repoUrl: 'https://github.com/skycubeuk/Canv',
    })
    expect(notes).toContain('**Full changelog**: https://github.com/skycubeuk/Canv/compare/v0.9.0...v0.9.1')
  })

  it('handles an empty commit list', () => {
    expect(buildNotes([], {})).toContain('_No changes recorded between tags._')
  })
})

describe('downloadsHeader', () => {
  let downloadsHeader
  beforeAll(async () => {
    ({ downloadsHeader } = await import('./release-notes.mjs'))
  })

  it('lists all seven shipped artifacts for the version', () => {
    const h = downloadsHeader('0.10.0')
    expect(h).toContain('# Canv 0.10.0')
    for (const f of [
      'Canv-0.10.0-arm64.dmg', 'Canv-0.10.0.dmg',
      'Canv-Setup-0.10.0.exe', 'Canv-0.10.0.exe',
      'Canv-0.10.0.AppImage', 'canv_0.10.0_amd64.deb', 'canv-0.10.0.x86_64.rpm',
    ]) expect(h).toContain(`\`${f}\``)
    expect(h).toContain('Gatekeeper')
  })

  it('buildNotes leads with the header when a tag is given', () => {
    const notes = buildNotes(['feat: x'], { tag: 'v0.10.0' })
    expect(notes.startsWith('# Canv 0.10.0')).toBe(true)
    expect(notes.indexOf('## Downloads')).toBeLessThan(notes.indexOf('## Features'))
  })
})
