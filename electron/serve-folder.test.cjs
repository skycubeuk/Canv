const { slugifyHeading } = require('./serve-folder.cjs')

describe('slugifyHeading', () => {
  it('lowercases and replaces non-alphanumerics with single dashes', () => {
    expect(slugifyHeading('Hello World')).toBe('hello-world')
    expect(slugifyHeading('  Trimmed  ')).toBe('trimmed')
    expect(slugifyHeading('A — B  C')).toBe('a-b-c')
    expect(slugifyHeading('Heading 2!!')).toBe('heading-2')
    expect(slugifyHeading('Привет, world')).toBe('world')
    expect(slugifyHeading('')).toBe('')
  })
})

const path = require('node:path')
const { safeResolve } = require('./serve-folder.cjs')

describe('safeResolve', () => {
  const root = path.resolve('/tmp/canv-serve-root')

  it('resolves a clean path under root', () => {
    expect(safeResolve(root, '/foo/bar.md')).toBe(path.join(root, 'foo', 'bar.md'))
  })
  it('resolves the root itself', () => {
    expect(safeResolve(root, '/')).toBe(root)
  })
  it('decodes percent-encoded segments', () => {
    expect(safeResolve(root, '/My%20Notes/foo.md'))
      .toBe(path.join(root, 'My Notes', 'foo.md'))
  })
  it('rejects parent-traversal', () => {
    expect(safeResolve(root, '/../etc/passwd')).toBeNull()
    expect(safeResolve(root, '/foo/../../etc/passwd')).toBeNull()
  })
  it('rejects null bytes', () => {
    expect(safeResolve(root, '/foo\x00.md')).toBeNull()
  })
  it('rejects malformed percent-encoding', () => {
    expect(safeResolve(root, '/%E0%A4%A')).toBeNull()
  })
  it('handles a root passed with a trailing separator', () => {
    expect(safeResolve(root + path.sep, '/foo.md')).toBe(path.join(root, 'foo.md'))
  })
  it('rejects a path that shares a prefix with root', () => {
    // path.resolve(root, '../canv-serve-rootevil/x') yields a sibling path
    // that begins with root's string but is NOT inside root. The path.sep
    // suffix check catches it; this test pins that behaviour.
    expect(safeResolve(root, '/../canv-serve-rootevil/x')).toBeNull()
  })
  it('rejects backslashes in the decoded path', () => {
    expect(safeResolve(root, '/foo%5Cbar')).toBeNull()  // %5C decodes to \
    expect(safeResolve(root, '/\\foo')).toBeNull()
  })
})

const fs = require('node:fs')
const os = require('node:os')
const { buildPageIndex, preprocessMarkdown } = require('./serve-folder.cjs')

function makeTree(spec) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-serve-'))
  for (const [rel, body] of Object.entries(spec)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  return dir
}

describe('buildPageIndex', () => {
  it('resolves by basename across subfolders', () => {
    const root = makeTree({
      'index.md': '# i',
      'notes/foo.md': '# f',
      'archive/old.md': '# o',
    })
    const idx = buildPageIndex(root)
    expect(idx.resolve('foo')).toBe('notes/foo.md')
    expect(idx.resolve('Foo')).toBe('notes/foo.md')
    expect(idx.resolve('old')).toBe('archive/old.md')
    expect(idx.resolve('missing')).toBeNull()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('on collisions prefers shortest path then alphabetical', () => {
    const root = makeTree({
      'a/foo.md': '',
      'b/c/foo.md': '',
      'd/foo.md': '',
    })
    const idx = buildPageIndex(root)
    // a/foo.md and d/foo.md tie on length; alphabetical => a/foo.md
    expect(idx.resolve('foo')).toBe('a/foo.md')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('resolves an explicit relative path with a slash', () => {
    const root = makeTree({
      'a/foo.md': '',
      'b/foo.md': '',
    })
    const idx = buildPageIndex(root)
    expect(idx.resolve('b/foo')).toBe('b/foo.md')
    expect(idx.resolve('nope/foo')).toBeNull()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('ignores hidden dirs and node_modules', () => {
    const root = makeTree({
      '.git/HEAD': 'x',
      '.obsidian/foo.md': '',
      'node_modules/pkg/foo.md': '',
      'real.md': '',
    })
    const idx = buildPageIndex(root)
    expect(idx.resolve('foo')).toBeNull()
    expect(idx.resolve('real')).toBe('real.md')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('add() and remove() update resolution', () => {
    const root = makeTree({ 'index.md': '' })
    const idx = buildPageIndex(root)
    expect(idx.resolve('foo')).toBeNull()
    fs.writeFileSync(path.join(root, 'foo.md'), '')
    idx.add(path.join(root, 'foo.md'))
    expect(idx.resolve('foo')).toBe('foo.md')
    idx.remove(path.join(root, 'foo.md'))
    expect(idx.resolve('foo')).toBeNull()
    fs.rmSync(root, { recursive: true, force: true })
  })
})

function fakeIndex(map) {
  return {
    resolve(name) { return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : null },
  }
}

function preprocess(src, opts = {}) {
  return preprocessMarkdown({
    src,
    pageIndex: opts.pageIndex || fakeIndex({}),
    currentRel: opts.currentRel || 'index.md',
    depth: 0,
    renderEmbed: opts.renderEmbed || ((rel) => `<div data-embed="${rel}"></div>`),
  })
}

describe('preprocessMarkdown', () => {
  it('rewrites a plain wikilink', () => {
    const out = preprocess('See [[Foo]] now.', {
      pageIndex: fakeIndex({ Foo: 'notes/Foo.md' }),
    })
    expect(out).toBe('See [Foo](/notes/Foo) now.')
  })

  it('rewrites a wikilink with alias', () => {
    const out = preprocess('Hi [[Foo|the foo]] here.', {
      pageIndex: fakeIndex({ Foo: 'Foo.md' }),
    })
    expect(out).toBe('Hi [the foo](/Foo) here.')
  })

  it('rewrites a wikilink with heading', () => {
    const out = preprocess('Jump [[Foo#A Section]].', {
      pageIndex: fakeIndex({ Foo: 'Foo.md' }),
    })
    expect(out).toBe('Jump [Foo › A Section](/Foo#a-section).')
  })

  it('emits a broken chip for an unresolvable wikilink', () => {
    const out = preprocess('[[Missing]]')
    expect(out).toBe('<span class="canv-broken">Missing</span>')
  })

  it('embeds an image as an <img> rooted at /', () => {
    const out = preprocess('![[diagram.png]]', { currentRel: 'notes/page.md' })
    expect(out).toContain('<img src="/notes/diagram.png" alt="diagram.png" />')
  })

  it('embeds audio and video by extension', () => {
    const a = preprocess('![[song.mp3]]')
    const v = preprocess('![[clip.mp4]]')
    expect(a).toContain('<audio')
    expect(a).toContain('src="/song.mp3"')
    expect(v).toContain('<video')
    expect(v).toContain('src="/clip.mp4"')
  })

  it('inlines a note embed using renderEmbed', () => {
    const calls = []
    const out = preprocessMarkdown({
      src: 'Before\n\n![[Other]]\n\nAfter',
      pageIndex: fakeIndex({ Other: 'sub/Other.md' }),
      currentRel: 'index.md',
      depth: 0,
      renderEmbed: (rel, d) => { calls.push([rel, d]); return '<p>EMB</p>' },
    })
    expect(calls).toEqual([['sub/Other.md', 1]])
    expect(out).toContain('\n\n<p>EMB</p>\n\n')
  })

  it('does not recurse note embeds past depth 3', () => {
    const out = preprocessMarkdown({
      src: '![[X]]',
      pageIndex: fakeIndex({ X: 'X.md' }),
      currentRel: 'a.md',
      depth: 3,
      renderEmbed: () => '<p>NOPE</p>',
    })
    expect(out).toContain('<span class="canv-broken">X</span>')
  })

  it('rewrites markdown links to .md files (drops extension, roots at /)', () => {
    const out = preprocess('See [foo](sub/Foo.md).', { currentRel: 'index.md' })
    expect(out).toBe('See [foo](/sub/Foo).')
  })

  it('resolves relative .md links from the current file', () => {
    const out = preprocess('go [bar](./bar.md)', { currentRel: 'notes/here.md' })
    expect(out).toBe('go [bar](/notes/bar)')
  })

  it('percent-encodes spaces in rewritten wikilink URLs so marked recognises the link', () => {
    // Without encoding, [Label](/path with spaces) is NOT a valid markdown link
    // and `marked` leaves it as raw text — defeating the rewrite.
    const wiki = preprocess('See [[Chapter Breakdown]].', {
      pageIndex: fakeIndex({ 'Chapter Breakdown': '01 Plot/Chapter Breakdown.md' }),
    })
    expect(wiki).toBe('See [Chapter Breakdown](/01%20Plot/Chapter%20Breakdown).')

    const wikiHeading = preprocess('See [[Foo Bar#Some Heading]].', {
      pageIndex: fakeIndex({ 'Foo Bar': 'Foo Bar.md' }),
    })
    expect(wikiHeading).toBe('See [Foo Bar › Some Heading](/Foo%20Bar#some-heading).')
  })

  it('leaves http/mailto/anchor/image links alone', () => {
    const out = preprocess('[a](https://x) [b](mailto:x) [c](#h) ![d](pic.png)')
    expect(out).toBe('[a](https://x) [b](mailto:x) [c](#h) ![d](pic.png)')
  })

  it('does not rewrite wikilinks inside fenced code', () => {
    const src = 'before\n```\n[[Foo]]\n```\nafter [[Foo]]'
    const out = preprocess(src, { pageIndex: fakeIndex({ Foo: 'Foo.md' }) })
    expect(out).toContain('```\n[[Foo]]\n```')
    expect(out).toContain('after [Foo](/Foo)')
  })

  it('does not rewrite wikilinks inside inline code', () => {
    const src = 'inline `[[Foo]]` and outside [[Foo]]'
    const out = preprocess(src, { pageIndex: fakeIndex({ Foo: 'Foo.md' }) })
    expect(out).toBe('inline `[[Foo]]` and outside [Foo](/Foo)')
  })

  it('does not rewrite wikilinks inside ~~~ fenced blocks', () => {
    const src = '~~~\n[[Foo]]\n~~~\n[[Foo]]'
    const out = preprocess(src, { pageIndex: fakeIndex({ Foo: 'Foo.md' }) })
    expect(out.split('[[Foo]]').length - 1).toBe(1) // exactly one survives
  })

  it('escapes quotes in asset filenames so they cannot break out of the src attribute', () => {
    const out = preprocess('![[ev"il.png]]', { currentRel: 'index.md' })
    expect(out).not.toContain('src="/ev"il.png"')
    expect(out).toContain('&quot;')
    // Both src and alt should contain the escaped filename.
    expect(out).toMatch(/src="\/[^"]+"/)
  })
})

const { renderHtml, extractTitle, STYLESHEET } = require('./serve-folder.cjs')

describe('renderHtml', () => {
  it('produces a complete HTML doc with title, stylesheet link, and reload script', () => {
    const html = renderHtml({ title: 'Hello', bodyHtml: '<p>hi</p>' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>Hello</title>')
    expect(html).toContain('href="/__canv/style.css"')
    expect(html).toContain('new EventSource(\'/__canv/reload\')')
    expect(html).toContain('<p>hi</p>')
  })
  it('escapes the title', () => {
    const html = renderHtml({ title: 'A <b>&</b>', bodyHtml: '' })
    expect(html).toContain('<title>A &lt;b&gt;&amp;&lt;/b&gt;</title>')
  })

  it('places navHtml between <body> and <main> when provided, and emits a __canvServeRoot script', () => {
    const html = renderHtml({
      title: 'T',
      bodyHtml: '<p>x</p>',
      navHtml: '<nav id="N"></nav>',
      serveRoot: '/some/path',
    })
    const navIdx = html.indexOf('<nav id="N">')
    const mainIdx = html.indexOf('<main>')
    expect(navIdx).toBeGreaterThan(0)
    expect(mainIdx).toBeGreaterThan(navIdx)
    expect(html).toContain('window.__canvServeRoot = "/some/path"')
  })

  it('omits navHtml and __canvServeRoot when not provided (back-compat)', () => {
    const html = renderHtml({ title: 'T', bodyHtml: '' })
    expect(html).not.toContain('canv-nav')
    expect(html).not.toContain('__canvServeRoot')
  })

  it('embeds the nav client script when navHtml is provided', () => {
    const html = renderHtml({
      title: 'T',
      bodyHtml: '',
      navHtml: '<nav id="N"></nav>',
      serveRoot: '/x',
    })
    expect(html).toContain("'canvNavState:'")        // localStorage key prefix
    expect(html).toContain('canv-nav-toggle')        // mobile button selector
    expect(html).toContain('data-nav-open')          // body attribute
    expect(html).toContain("a.active")               // active-link query
  })

  it('omits the nav client script when navHtml is absent', () => {
    const html = renderHtml({ title: 'T', bodyHtml: '' })
    expect(html).not.toContain('canvNavState:')
  })

  it('closes the mobile drawer when a link inside the nav is tapped', () => {
    const html = renderHtml({
      title: 'T', bodyHtml: '',
      navHtml: '<nav id="N"></nav>',
      serveRoot: '/x',
    })
    // The script attaches a click handler to the tree that calls
    // removeAttribute('data-nav-open') when the click target matches an <a>.
    expect(html).toMatch(/tree\.addEventListener\('click'[\s\S]*closest\('a'\)[\s\S]*removeAttribute\('data-nav-open'\)/)
  })
})

describe('extractTitle', () => {
  it('uses the first H1', () => {
    expect(extractTitle('# Hello\n\nbody', 'fallback')).toBe('Hello')
  })
  it('skips fenced code blocks when looking for H1', () => {
    expect(extractTitle('```\n# Not a title\n```\n# Real', 'fb')).toBe('Real')
  })
  it('falls back when no H1', () => {
    expect(extractTitle('no heading', 'fb.md')).toBe('fb.md')
  })
})

describe('STYLESHEET', () => {
  it('contains the .canv-broken rule and a dark-mode block', () => {
    expect(STYLESHEET).toContain('.canv-broken')
    expect(STYLESHEET).toContain('prefers-color-scheme: dark')
  })
  it('contains the nav sidebar and mobile toggle rules', () => {
    expect(STYLESHEET).toContain('.canv-nav')
    expect(STYLESHEET).toContain('.canv-nav-tree')
    expect(STYLESHEET).toContain('.canv-nav-toggle')
    expect(STYLESHEET).toContain('a.active')
    expect(STYLESHEET).toContain('@media (max-width: 800px)')
    expect(STYLESHEET).toMatch(/body\s*{[^}]*display:\s*flex/)
  })
})

const http = require('node:http')
const serve = require('./serve-folder.cjs')
const { start, stop, status, ServeError } = serve

async function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.on('error', reject)
  })
}

async function withServer(treeSpec, fn) {
  const root = makeTree(treeSpec)
  let url
  try {
    url = (await start(root)).url
    await fn(url, root)
  } finally {
    await serve.stopAll()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe('serve-folder server', () => {
  afterEach(async () => { try { await serve.stopAll() } catch { /* ignore */ } })

  it('rejects with NO_INDEX when index.md is missing', async () => {
    const root = makeTree({ 'foo.md': '# foo' })
    try {
      await expect(start(root)).rejects.toMatchObject({ code: 'NO_INDEX' })
      expect(status()).toEqual({ running: false })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('serves index.md at /', async () => {
    await withServer({ 'index.md': '# Hello\n\nworld' }, async (url) => {
      const r = await get(url + '/')
      expect(r.status).toBe(200)
      expect(r.body).toContain('<title>Hello</title>')
      expect(r.body).toContain('<h1')
      expect(r.body).toContain('Hello')
      expect(r.body).toContain('world')
    })
  })

  it('serves a stylesheet on /__canv/style.css', async () => {
    await withServer({ 'index.md': '# i' }, async (url) => {
      const r = await get(url + '/__canv/style.css')
      expect(r.status).toBe(200)
      expect(r.headers['content-type']).toContain('text/css')
      expect(r.body).toContain('.canv-broken')
    })
  })

  it('rejects path traversal with 404', async () => {
    await withServer({ 'index.md': '# i' }, async (url) => {
      const r = await get(url + '/../../etc/passwd')
      // Node's http normalises URLs but we still must not escape.
      expect([400, 404]).toContain(r.status)
    })
  })

  it('returns 404 for non-whitelisted asset extensions', async () => {
    await withServer({
      'index.md': '# i',
      'data.zip': 'binary',
    }, async (url) => {
      const r = await get(url + '/data.zip')
      expect(r.status).toBe(404)
    })
  })

  it('serves a whitelisted image with the right mime', async () => {
    await withServer({
      'index.md': '# i',
      'pic.png': '\x89PNG\r\n\x1a\n',
    }, async (url) => {
      const r = await get(url + '/pic.png')
      expect(r.status).toBe(200)
      expect(r.headers['content-type']).toContain('image/png')
    })
  })

  it('start() while running switches to the new root', async () => {
    const a = makeTree({ 'index.md': '# a' })
    const b = makeTree({ 'index.md': '# b' })
    try {
      await start(a)
      const second = await start(b)
      // The shared server stays up; it now serves root b.
      const r = await get(second.url + '/')
      expect(r.body).toContain('<title>b</title>')
    } finally {
      await serve.stopAll()
      fs.rmSync(a, { recursive: true, force: true })
      fs.rmSync(b, { recursive: true, force: true })
    }
  })

  it('rewrites a wikilink end-to-end', async () => {
    await withServer({
      'index.md': '# i\n\nSee [[Foo]].',
      'Foo.md': '# Foo',
    }, async (url) => {
      const r = await get(url + '/')
      expect(r.body).toContain('href="/Foo"')
    })
  })

  it('emits id="…" on rendered headings so [[Page#Heading]] anchors land', async () => {
    await withServer({
      'index.md': '# Home\n\n## A Specific Heading\n\nbody\n\n## Another One',
    }, async (url) => {
      const r = await get(url + '/')
      // Slug must match what slugifyHeading produces (lowercase, dashes).
      expect(r.body).toContain('<h1 id="home">Home</h1>')
      expect(r.body).toContain('<h2 id="a-specific-heading">A Specific Heading</h2>')
      expect(r.body).toContain('<h2 id="another-one">Another One</h2>')
    })
  })
})

const { setTimeout: delay } = require('node:timers/promises')

async function openSse(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => resolve({ res, req }))
  })
}

describe('serve-folder live reload', () => {
  afterEach(async () => { try { await serve.stopAll() } catch { /* ignore */ } })

  it('keeps the SSE stream open and broadcasts reload on file change', async () => {
    const root = makeTree({ 'index.md': '# i' })
    try {
      const { url } = await start(root)
      const { res } = await openSse(url + '/__canv/reload')
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/event-stream')
      const chunks = []
      res.on('data', (c) => chunks.push(c.toString('utf8')))
      // Touch a file.
      await delay(100)
      fs.writeFileSync(path.join(root, 'index.md'), '# i\nnew')
      // Wait past the 100ms debounce.
      await delay(400)
      const seen = chunks.join('')
      expect(seen).toContain('data: reload')
      res.destroy()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('updates the page index when a new .md file is added', async () => {
    const root = makeTree({ 'index.md': '# i\n\n[[New]]' })
    try {
      const { url } = await start(root)
      let r1 = await get(url + '/')
      expect(r1.body).toContain('canv-broken')
      fs.writeFileSync(path.join(root, 'New.md'), '# new')
      await delay(400)
      let r2 = await get(url + '/')
      expect(r2.body).toContain('href="/New"')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

const { buildNavTree } = require('./serve-folder.cjs')

describe('buildNavTree', () => {
  it('returns a nested tree of folders and md files', () => {
    const root = makeTree({
      'index.md': '',
      'a/foo.md': '',
      'a/bar.md': '',
      'b/c/deep.md': '',
    })
    try {
      const tree = buildNavTree(root)
      expect(tree.kind).toBe('folder')
      expect(tree.relPath).toBe('')
      const names = tree.children.map((c) => `${c.kind}:${c.name}`)
      expect(names).toEqual(['folder:a', 'folder:b', 'file:index'])
      const a = tree.children.find((c) => c.name === 'a')
      expect(a.children.map((c) => c.name)).toEqual(['bar', 'foo'])
      const b = tree.children.find((c) => c.name === 'b')
      expect(b.children).toHaveLength(1)
      expect(b.children[0].kind).toBe('folder')
      expect(b.children[0].children[0].relPath).toBe('b/c/deep.md')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('strips .md from file display names but keeps it in relPath', () => {
    const root = makeTree({ 'Hello World.md': '' })
    try {
      const tree = buildNavTree(root)
      const file = tree.children[0]
      expect(file).toMatchObject({ kind: 'file', name: 'Hello World', relPath: 'Hello World.md' })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('sorts case-insensitively within a group', () => {
    const root = makeTree({
      'banana.md': '', 'Apple.md': '', 'cherry.md': '',
      'Beta/x.md': '', 'alpha/y.md': '',
    })
    try {
      const names = buildNavTree(root).children.map((c) => c.name)
      expect(names).toEqual(['alpha', 'Beta', 'Apple', 'banana', 'cherry'])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('prunes folders with no markdown descendants', () => {
    const root = makeTree({
      'keep/foo.md': '',
      'drop/img.png': 'binary',
      'drop/sub/notes.txt': 'text',
    })
    try {
      const names = buildNavTree(root).children.map((c) => c.name)
      expect(names).toEqual(['keep'])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips dotfiles, dotfolders, and node_modules', () => {
    const root = makeTree({
      '.git/HEAD': '',
      '.obsidian/foo.md': '',
      'node_modules/pkg/foo.md': '',
      'real.md': '',
    })
    try {
      const names = buildNavTree(root).children.map((c) => c.name)
      expect(names).toEqual(['real'])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('handles deep nesting (3+ levels)', () => {
    const root = makeTree({ 'a/b/c/d.md': '' })
    try {
      const tree = buildNavTree(root)
      const a = tree.children[0]
      const b = a.children[0]
      const c = b.children[0]
      const d = c.children[0]
      expect(d).toMatchObject({ kind: 'file', name: 'd', relPath: 'a/b/c/d.md' })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

const { renderNavHtml } = require('./serve-folder.cjs')

const sampleTree = {
  kind: 'folder', name: '', relPath: '', children: [
    { kind: 'folder', name: '01 Plot', relPath: '01 Plot', children: [
      { kind: 'file', name: 'Foo', relPath: '01 Plot/Foo.md' },
    ] },
    { kind: 'file', name: 'index', relPath: 'index.md' },
  ],
}

describe('renderNavHtml', () => {
  it('emits a <nav> with a tree of details/ul/li/a elements', () => {
    const html = renderNavHtml({ tree: sampleTree, currentRel: 'index.md' })
    expect(html).toContain('<nav class="canv-nav"')
    expect(html).toContain('aria-label="Site navigation"')
    expect(html).toContain('<button class="canv-nav-toggle"')
    expect(html).toContain('id="canv-nav-tree"')
    expect(html).toContain('<details data-rel="01 Plot">')
    expect(html).toContain('<summary>01 Plot</summary>')
    expect(html).toContain('<a href="/01%20Plot/Foo" data-rel="01 Plot/Foo.md">Foo</a>')
  })

  it('marks the current page as active', () => {
    const html = renderNavHtml({ tree: sampleTree, currentRel: 'index.md' })
    expect(html).toMatch(/<a href="\/index"[^>]*class="active"[^>]*>index<\/a>/)
    expect(html).not.toMatch(/<a [^>]*class="active"[^>]*>Foo<\/a>/)
  })

  it('marks no link active when currentRel does not match a file', () => {
    const html = renderNavHtml({ tree: sampleTree, currentRel: 'nope.md' })
    expect(html).not.toContain('class="active"')
  })

  it('URL-encodes spaces and special characters in hrefs', () => {
    const tree = {
      kind: 'folder', name: '', relPath: '', children: [
        { kind: 'file', name: "Hessa's Tavern", relPath: "04 Inst/Hessa's Tavern.md" },
      ],
    }
    const html = renderNavHtml({ tree, currentRel: '' })
    // Spaces → %20; apostrophes are NOT encoded by encodeURI but ARE escaped in HTML attribute context to &#39;
    expect(html).toContain('href="/04%20Inst/Hessa&#39;s%20Tavern"')
  })

  it('escapes HTML-special characters in names', () => {
    const tree = {
      kind: 'folder', name: '', relPath: '', children: [
        { kind: 'file', name: 'A & B <c>', relPath: 'A & B <c>.md' },
      ],
    }
    const html = renderNavHtml({ tree, currentRel: '' })
    expect(html).toContain('>A &amp; B &lt;c&gt;</a>')
  })

  it('renders an empty tree as a nav with no list items', () => {
    const tree = { kind: 'folder', name: '', relPath: '', children: [] }
    const html = renderNavHtml({ tree, currentRel: '' })
    expect(html).toContain('<ul id="canv-nav-tree" class="canv-nav-tree">')
    expect(html).not.toContain('<li')
  })
})

describe('serve-folder nav integration', () => {
  afterEach(async () => { try { await serve.stopAll() } catch { /* ignore */ } })

  it('serves the nav sidebar on every markdown page', async () => {
    await withServer({
      'index.md': '# Home',
      'a/foo.md': '# Foo',
    }, async (url) => {
      const r1 = await get(url + '/')
      expect(r1.body).toContain('<nav class="canv-nav"')
      expect(r1.body).toContain('<a href="/a/foo"')
      expect(r1.body).toMatch(/<a href="\/index"[^>]*class="active"[^>]*>index<\/a>/)

      const r2 = await get(url + '/a/foo')
      expect(r2.body).toContain('<nav class="canv-nav"')
      expect(r2.body).toMatch(/<a href="\/a\/foo"[^>]*class="active"[^>]*>foo<\/a>/i)
      expect(r2.body).not.toMatch(/<a href="\/index"[^>]*class="active"/)
    })
  })

  it('emits __canvServeRoot for the nav script', async () => {
    await withServer({ 'index.md': '# i' }, async (url) => {
      const r = await get(url + '/')
      expect(r.body).toContain('window.__canvServeRoot = ')
    })
  })

  it('rebuilds the nav after a new .md is added', async () => {
    const root = makeTree({ 'index.md': '# i' })
    try {
      const { url } = await start(root)
      const r1 = await get(url + '/')
      expect(r1.body).not.toContain('data-rel="New.md"')
      fs.writeFileSync(path.join(root, 'New.md'), '# new')
      await delay(400)
      const r2 = await get(url + '/')
      expect(r2.body).toContain('data-rel="New.md"')
    } finally {
      await serve.stopAll()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('serve-folder auto-stop', () => {
  afterEach(async () => { try { await serve.stopAll() } catch { /* ignore */ } })

  it('stops itself when the root directory is removed', async () => {
    const root = makeTree({ 'index.md': '# i' })
    const { url } = await start(root)
    expect(status()).toMatchObject({ running: true })
    fs.rmSync(root, { recursive: true, force: true })
    // Wait for chokidar to detect.
    for (let i = 0; i < 30 && status().running; i++) await delay(100)
    expect(status()).toEqual({ running: false })
    // The shared HTTP server stays up but returns 503 with no markdown root active.
    const r = await get(url + '/')
    expect(r.status).toBe(503)
  })
})

async function fetchPlain(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
      res.on('error', reject)
    }).on('error', reject)
  })
}

describe('serve-folder: site mounts', () => {
  let tmp
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-site-mount-'))
  })
  afterEach(async () => {
    serve._setSiteLibsDir(path.join(path.dirname(require.resolve('./serve-folder.cjs')), 'site-libs'))
    await serve.stopAll()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('mountSite serves files from the site folder', async () => {
    const root = path.join(tmp, 'a3f2')
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, 'index.html'), '<html>hi</html>')
    const { url } = await serve.mountSite('a3f2', root)
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/site\/a3f2\/$/)
    const r = await fetchPlain(url + 'index.html')
    expect(r.status).toBe(200)
    expect(r.body).toBe('<html>hi</html>')
  })

  it('mountSite root URL serves entry index.html if present', async () => {
    const root = path.join(tmp, 'a3f2')
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(root, 'index.html'), '<html>root</html>')
    const { url } = await serve.mountSite('a3f2', root)
    const r = await fetchPlain(url)
    expect(r.status).toBe(200)
    expect(r.body).toContain('root')
  })

  it('refuses path traversal inside a site mount', async () => {
    const root = path.join(tmp, 'a')
    fs.mkdirSync(root, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'secret.txt'), 'nope')
    fs.writeFileSync(path.join(root, 'ok.txt'), 'ok')
    const { url } = await serve.mountSite('a', root)
    const escape = url.replace(/\/site\/a\/$/, '/site/a/../secret.txt')
    const r = await fetchPlain(escape)
    expect(r.status).toBe(404)
  })

  it('does not leak between mounts', async () => {
    fs.mkdirSync(path.join(tmp, 'a'))
    fs.mkdirSync(path.join(tmp, 'b'))
    fs.writeFileSync(path.join(tmp, 'a', 'x.txt'), 'aaa')
    fs.writeFileSync(path.join(tmp, 'b', 'x.txt'), 'bbb')
    const a = await serve.mountSite('a', path.join(tmp, 'a'))
    const b = await serve.mountSite('b', path.join(tmp, 'b'))
    const ra = await fetchPlain(a.url + 'x.txt')
    const rb = await fetchPlain(b.url + 'x.txt')
    expect(ra.body).toBe('aaa')
    expect(rb.body).toBe('bbb')
  })

  it('serves /_lib/* from electron/site-libs/', async () => {
    // Use a temp dir for libs so this test is independent of Task 4 vendoring.
    const libs = path.join(tmp, 'libs')
    fs.mkdirSync(libs)
    fs.writeFileSync(path.join(libs, 'demo.js'), '// demo')
    serve._setSiteLibsDir(libs)
    fs.mkdirSync(path.join(tmp, 'a'), { recursive: true })
    const a = await serve.mountSite('a', path.join(tmp, 'a'))
    const base = a.url.replace(/\/site\/a\/$/, '')
    const r = await fetchPlain(base + '/_lib/demo.js')
    expect(r.status).toBe(200)
    expect(r.body).toBe('// demo')
  })

  it('unmountSite stops serving that site', async () => {
    fs.mkdirSync(path.join(tmp, 'a'))
    fs.writeFileSync(path.join(tmp, 'a', 'x.txt'), 'a')
    const a = await serve.mountSite('a', path.join(tmp, 'a'))
    await serve.unmountSite('a')
    const r = await fetchPlain(a.url + 'x.txt')
    expect(r.status).toBe(404)
  })

  it('mountSite is idempotent', async () => {
    fs.mkdirSync(path.join(tmp, 'a'))
    const r1 = await serve.mountSite('a', path.join(tmp, 'a'))
    const r2 = await serve.mountSite('a', path.join(tmp, 'a'))
    expect(r2.url).toBe(r1.url)
  })

  it('mountSite updates root on re-mount with a different folder', async () => {
    const a1 = path.join(tmp, 'a1')
    const a2 = path.join(tmp, 'a2')
    fs.mkdirSync(a1, { recursive: true })
    fs.mkdirSync(a2, { recursive: true })
    fs.writeFileSync(path.join(a1, 'x.txt'), 'one')
    fs.writeFileSync(path.join(a2, 'x.txt'), 'two')
    const r1 = await serve.mountSite('a', a1)
    const first = await fetchPlain(r1.url + 'x.txt')
    expect(first.body).toBe('one')
    const r2 = await serve.mountSite('a', a2)
    expect(r2.url).toBe(r1.url)              // URL stable
    const second = await fetchPlain(r2.url + 'x.txt')
    expect(second.body).toBe('two')          // content updated
  })

  it('listSiteMounts reflects current mounts', async () => {
    fs.mkdirSync(path.join(tmp, 'a'))
    fs.mkdirSync(path.join(tmp, 'b'))
    await serve.mountSite('a', path.join(tmp, 'a'))
    await serve.mountSite('b', path.join(tmp, 'b'))
    const mounts = serve.listSiteMounts()
    expect(mounts.map((m) => m.id).sort()).toEqual(['a', 'b'])
  })

  it('markdown-mode start does not unmount sites', async () => {
    fs.mkdirSync(path.join(tmp, 'site-a'))
    await serve.mountSite('a', path.join(tmp, 'site-a'))
    fs.mkdirSync(path.join(tmp, 'mdroot'))
    fs.writeFileSync(path.join(tmp, 'mdroot', 'index.md'), '# hi')
    await serve.start(path.join(tmp, 'mdroot'))
    expect(serve.listSiteMounts()).toHaveLength(1)
    await serve.stop()
    // After stop() the site mount is still served and the server is still up.
    expect(serve.listSiteMounts()).toHaveLength(1)
  })

  it('serves the real vendored d3 file via /_lib/', async () => {
    // Reset to the default site-libs path (a previous test may have overridden it).
    serve._setSiteLibsDir(path.join(__dirname, 'site-libs'))
    fs.mkdirSync(path.join(tmp, 'a'), { recursive: true })
    const a = await serve.mountSite('a', path.join(tmp, 'a'))
    const base = a.url.replace(/\/site\/a\/$/, '')
    const r = await fetchPlain(base + '/_lib/d3.v7.min.js')
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThan(10000)
  })
})
