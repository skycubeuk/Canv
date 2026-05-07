'use strict'

const path = require('node:path')
const fs = require('node:fs')

// Heading slug: lowercases and collapses non-alphanumerics to single dashes.
// Two headings with the same slug-form will produce identical anchors —
// matches Obsidian and the Wiki convention; we don't dedupe within a document.
function slugifyHeading(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function safeResolve(root, urlPath) {
  root = path.resolve(root)
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decoded.includes('\x00')) return null
  // Reject any backslash in the decoded path — URL paths are forward-slash only.
  if (decoded.includes('\\')) return null
  // Strip leading slashes so path.resolve treats it as relative to root.
  const trimmed = decoded.replace(/^[\\/]+/, '')
  const resolved = path.resolve(root, trimmed)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

function buildPageIndex(rootDir) {
  // Map from lowercased basename (no .md) to sorted array of relative paths.
  const byName = new Map()
  const allRels = new Set()

  function relOf(abs) {
    return path.relative(rootDir, abs).split(path.sep).join('/')
  }

  function insertRel(rel) {
    if (allRels.has(rel)) return
    allRels.add(rel)
    const base = path.basename(rel, '.md').toLowerCase()
    const list = byName.get(base) || []
    list.push(rel)
    list.sort((a, b) => (a.length - b.length) || a.localeCompare(b))
    byName.set(base, list)
  }

  function removeRel(rel) {
    if (!allRels.has(rel)) return
    allRels.delete(rel)
    const base = path.basename(rel, '.md').toLowerCase()
    const list = byName.get(base)
    if (!list) return
    const next = list.filter((p) => p !== rel)
    if (next.length === 0) byName.delete(base)
    else byName.set(base, next)
  }

  function walk(dir) {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
    catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) walk(abs)
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        insertRel(relOf(abs))
      }
    }
  }

  walk(rootDir)

  return {
    resolve(name) {
      if (typeof name !== 'string' || name.length === 0) return null
      if (name.includes('/')) {
        const rel = name.endsWith('.md') ? name : `${name}.md`
        return allRels.has(rel) ? rel : null
      }
      const list = byName.get(name.toLowerCase())
      return list && list.length > 0 ? list[0] : null
    },
    add(abs) { insertRel(relOf(abs)) },
    remove(abs) { removeRel(relOf(abs)) },
    size() { return allRels.size },
  }
}

function buildNavTree(rootDir) {
  function relOf(abs) {
    return path.relative(rootDir, abs).split(path.sep).join('/')
  }
  function ciCompare(a, b) {
    const la = a.toLowerCase(), lb = b.toLowerCase()
    return la < lb ? -1 : la > lb ? 1 : 0
  }
  function walk(absDir) {
    let entries
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }) }
    catch { return [] }
    const folders = []
    const files = []
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const abs = path.join(absDir, e.name)
      if (e.isDirectory()) {
        const children = walk(abs)
        if (children.length === 0) continue
        folders.push({
          kind: 'folder',
          name: e.name,
          relPath: relOf(abs),
          children,
        })
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        files.push({
          kind: 'file',
          name: e.name.replace(/\.md$/i, ''),
          relPath: relOf(abs),
        })
      }
    }
    folders.sort((a, b) => ciCompare(a.name, b.name))
    files.sort((a, b) => ciCompare(a.name, b.name))
    return [...folders, ...files]
  }
  return { kind: 'folder', name: '', relPath: '', children: walk(rootDir) }
}

function renderNavHtml({ tree, currentRel }) {
  function renderChildren(children) {
    if (children.length === 0) return ''
    let out = '<ul>'
    for (const c of children) {
      if (c.kind === 'folder') {
        out += `<li class="folder"><details data-rel="${escapeHtmlAttr(c.relPath)}">`
        out += `<summary>${escapeHtml(c.name)}</summary>`
        out += renderChildren(c.children)
        out += `</details></li>`
      } else {
        const href = encodeURI('/' + dropMdExt(c.relPath))
        const isActive = c.relPath === currentRel
        const cls = isActive ? ' class="active"' : ''
        out += `<li class="file"><a href="${escapeHtmlAttr(href)}" data-rel="${escapeHtmlAttr(c.relPath)}"${cls}>${escapeHtml(c.name)}</a></li>`
      }
    }
    out += '</ul>'
    return out
  }
  // The outermost <ul> carries the id/class instead of using renderChildren's bare <ul>.
  let inner = ''
  for (const c of tree.children) {
    if (c.kind === 'folder') {
      inner += `<li class="folder"><details data-rel="${escapeHtmlAttr(c.relPath)}">`
      inner += `<summary>${escapeHtml(c.name)}</summary>`
      inner += renderChildren(c.children)
      inner += `</details></li>`
    } else {
      const href = encodeURI('/' + dropMdExt(c.relPath))
      const isActive = c.relPath === currentRel
      const cls = isActive ? ' class="active"' : ''
      inner += `<li class="file"><a href="${escapeHtmlAttr(href)}" data-rel="${escapeHtmlAttr(c.relPath)}"${cls}>${escapeHtml(c.name)}</a></li>`
    }
  }
  // Toggle button is a sibling of <nav>, NOT a child — when the mobile drawer
  // slides off-screen via transform, a child button would slide off too,
  // making it impossible to reopen.
  return [
    '<button class="canv-nav-toggle" aria-controls="canv-nav-tree" type="button">Menu</button>',
    '<nav class="canv-nav" aria-label="Site navigation">',
    `<ul id="canv-nav-tree" class="canv-nav-tree">${inner}</ul>`,
    '</nav>',
  ].join('')
}

const IMG_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])
const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.wav'])
const VIDEO_EXTS = new Set(['.mp4', '.webm'])

function dropMdExt(rel) {
  return rel.replace(/\.(md|markdown)$/i, '')
}

// Resolve a markdown link target like "./bar.md" or "sub/foo.md" against the
// current file's directory, returning a rel path from root with .md preserved
// for index lookup. Returns null for absolute/external/anchor/query links.
function resolveRelMdLink(target, currentRel) {
  if (!target) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null   // scheme
  if (target.startsWith('/') || target.startsWith('#') || target.startsWith('?')) return null
  if (!/\.(md|markdown)(?:[#?]|$)/i.test(target)) return null
  const [pathPart, suffix] = (() => {
    const m = target.match(/^([^#?]*)([#?].*)?$/)
    return [m[1], m[2] || '']
  })()
  // Posix-style join from the current file's directory.
  const currentDir = currentRel.includes('/') ? currentRel.replace(/\/[^/]*$/, '') : ''
  const segments = (currentDir ? currentDir.split('/') : []).concat(pathPart.split('/'))
  const stack = []
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') stack.pop()
    else stack.push(seg)
  }
  return { rel: stack.join('/'), suffix }
}

function tokeniseCode(src) {
  const placeholders = []
  let out = ''
  let i = 0
  const N = src.length
  while (i < N) {
    // Fenced ```…``` or ~~~…~~~ at line start (i === 0 or preceded by newline).
    if (i === 0 || src[i - 1] === '\n') {
      const fenceMatch = src.slice(i).match(/^(```+|~~~+)([^\n]*)\n([\s\S]*?)\n\1[ \t]*(?:\n|$)/)
      if (fenceMatch) {
        const token = `\x00FENCE${placeholders.length}\x00`
        placeholders.push(fenceMatch[0])
        out += token
        i += fenceMatch[0].length
        continue
      }
    }
    // Inline `code` (single backtick, no embedded backticks).
    if (src[i] === '`') {
      const close = src.indexOf('`', i + 1)
      if (close !== -1 && !src.slice(i + 1, close).includes('\n')) {
        const token = `\x00INLINE${placeholders.length}\x00`
        placeholders.push(src.slice(i, close + 1))
        out += token
        i = close + 1
        continue
      }
    }
    out += src[i]
    i++
  }
  return { stripped: out, placeholders }
}

function restoreCode(stripped, placeholders) {
  return stripped.replace(/\x00(?:FENCE|INLINE)(\d+)\x00/g, (_, n) => placeholders[Number(n)])
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttr(s) { return escapeHtml(s) }

function resolveRelativeAsset(target, currentRel) {
  // Asset embeds are resolved relative to the current file's directory.
  if (target.startsWith('/')) return target.replace(/^\/+/, '')
  const currentDir = currentRel.includes('/') ? currentRel.replace(/\/[^/]*$/, '') : ''
  const segments = (currentDir ? currentDir.split('/') : []).concat(target.split('/'))
  const stack = []
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') stack.pop()
    else stack.push(seg)
  }
  return stack.join('/')
}

function preprocessMarkdown({ src, pageIndex, currentRel, depth, renderEmbed }) {
  const { stripped, placeholders } = tokeniseCode(src)
  let text = stripped

  // 1. Embeds first (so the leading "!" is consumed and not picked up as a wikilink).
  text = text.replace(/!\[\[([^\]]+?)\]\]/g, (_, inner) => {
    const name = inner.trim()
    const ext = (name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase()
    if (IMG_EXTS.has(ext)) {
      const rel = resolveRelativeAsset(name, currentRel)
      return `<img src="/${escapeHtmlAttr(rel)}" alt="${escapeHtmlAttr(name)}" />`
    }
    if (AUDIO_EXTS.has(ext)) {
      const rel = resolveRelativeAsset(name, currentRel)
      return `<audio controls src="/${escapeHtmlAttr(rel)}"></audio>`
    }
    if (VIDEO_EXTS.has(ext)) {
      const rel = resolveRelativeAsset(name, currentRel)
      return `<video controls src="/${escapeHtmlAttr(rel)}"></video>`
    }
    // Note embed.
    if (depth >= 3) return `<span class="canv-broken">${escapeHtml(name)}</span>`
    const targetRel = pageIndex.resolve(name)
    if (!targetRel) return `<span class="canv-broken">${escapeHtml(name)}</span>`
    const html = renderEmbed(targetRel, depth + 1)
    return `\n\n${html}\n\n`
  })

  // 2. Wikilinks.
  text = text.replace(/\[\[([^\]]+?)\]\]/g, (_, inner) => {
    let display = null
    let body = inner.trim()
    const aliasIdx = body.indexOf('|')
    if (aliasIdx !== -1) {
      display = body.slice(aliasIdx + 1).trim()
      body = body.slice(0, aliasIdx).trim()
    }
    let heading = null
    const hashIdx = body.indexOf('#')
    if (hashIdx !== -1) {
      heading = body.slice(hashIdx + 1).trim()
      body = body.slice(0, hashIdx).trim()
    }
    const targetRel = pageIndex.resolve(body)
    if (!targetRel) return `<span class="canv-broken">${escapeHtml(display || body)}</span>`
    const url = '/' + dropMdExt(targetRel) + (heading ? `#${slugifyHeading(heading)}` : '')
    const label = display || (heading ? `${body} › ${heading}` : body)
    return `[${label}](${encodeURI(url)})`
  })

  // 3. Standard markdown links to .md files.
  text = text.replace(/(\!)?\[([^\]]*)\]\(([^)\s]+?)\)/g, (whole, bang, label, target) => {
    if (bang) return whole
    const r = resolveRelMdLink(target, currentRel)
    if (!r) return whole
    return `[${label}](${encodeURI('/' + dropMdExt(r.rel) + r.suffix)})`
  })

  return restoreCode(text, placeholders)
}

const STYLESHEET = `
:root {
  --bg: #fafaf9;
  --fg: #1c1917;
  --muted: #57534e;
  --link: #2563eb;
  --code-bg: #f5f5f4;
  --border: #e7e5e4;
  --broken: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0c0a09;
    --fg: #f5f5f4;
    --muted: #a8a29e;
    --link: #60a5fa;
    --code-bg: #1c1917;
    --border: #292524;
    --broken: #f87171;
  }
}
* { box-sizing: border-box; }
html, body { background: var(--bg); color: var(--fg); }
body {
  margin: 0;
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
main { max-width: 44rem; margin: 0 auto; padding: 2rem 1.25rem 6rem; }
h1, h2, h3, h4 { line-height: 1.25; margin: 1.6em 0 .5em; }
h1 { font-size: 2rem; }
h2 { font-size: 1.5rem; }
h3 { font-size: 1.2rem; }
p, ul, ol, blockquote, pre, table { margin: 1em 0; }
a { color: var(--link); }
img, video { max-width: 100%; height: auto; }
audio { width: 100%; }
blockquote { border-left: 3px solid var(--border); margin-left: 0; padding: .25rem 1rem; color: var(--muted); }
code { background: var(--code-bg); padding: .1em .35em; border-radius: 3px; font-size: .92em; }
pre { background: var(--code-bg); padding: 1rem; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid var(--border); padding: .4rem .6rem; text-align: left; }
hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
.canv-broken { color: var(--broken); border-bottom: 1px dotted currentColor; }

/* Nav sidebar */
body { display: flex; min-height: 100vh; }
.canv-nav {
  flex: 0 0 16rem;
  position: sticky; top: 0;
  height: 100vh; overflow-y: auto;
  border-right: 1px solid var(--border);
  padding: 1rem 0.75rem;
  font-size: 0.9rem;
  box-sizing: border-box;
}
.canv-nav-tree, .canv-nav-tree ul {
  list-style: none; padding-left: 0; margin: 0;
}
.canv-nav-tree ul {
  padding-left: 0.85rem;
  border-left: 1px dashed var(--border);
  margin-left: 0.5rem;
}
.canv-nav summary {
  cursor: pointer;
  list-style: none;
  padding: 0.15rem 0.25rem;
  border-radius: 3px;
}
.canv-nav summary::-webkit-details-marker { display: none; }
.canv-nav summary::before {
  content: "\\25B8";
  display: inline-block;
  width: 1em;
  transition: transform 100ms;
  color: var(--muted);
}
.canv-nav details[open] > summary::before { transform: rotate(90deg); }
.canv-nav summary:hover, .canv-nav a:hover { background: var(--code-bg); }
.canv-nav a {
  display: block;
  padding: 0.15rem 0.25rem 0.15rem 1.25rem;
  border-radius: 3px;
  color: inherit;
  text-decoration: none;
}
.canv-nav a.active { background: var(--code-bg); font-weight: 600; }
.canv-nav-toggle { display: none; }

main { flex: 1 1 auto; min-width: 0; }

@media (max-width: 800px) {
  body { display: block; }
  .canv-nav {
    position: fixed;
    top: 0; left: 0;
    width: 16rem; height: 100vh;
    background: var(--bg);
    transform: translateX(-100%);
    transition: transform 150ms;
    z-index: 10;
  }
  body[data-nav-open] .canv-nav { transform: translateX(0); }
  body[data-nav-open] .canv-nav-toggle { display: none; }
  .canv-nav-toggle {
    display: inline-block;
    position: fixed;
    top: 0.5rem; left: 0.5rem;
    z-index: 11;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.4rem 0.7rem;
    cursor: pointer;
    color: inherit;
  }
  main { padding-top: 3rem; }
}
`

function extractTitle(src, fallback) {
  // Strip fenced code first so a heading inside a fence doesn't win.
  const noFences = src.replace(/(```|~~~)[\s\S]*?\1/g, '')
  const m = noFences.match(/^[ \t]*#[ \t]+(.+?)\s*$/m)
  if (!m) return fallback
  return m[1].trim() || fallback
}

function renderHtml({ title, bodyHtml, navHtml, serveRoot }) {
  const navBlock = navHtml ? `${navHtml}\n` : ''
  const rootScript = navHtml
    ? `<script>window.__canvServeRoot = ${JSON.stringify(serveRoot || '')}</script>\n`
    : ''
  const navScript = navHtml ? `<script>
(function () {
  var KEY = 'canvNavState:' + (window.__canvServeRoot || '');
  var tree = document.getElementById('canv-nav-tree');
  if (!tree) return;
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) {}
  tree.querySelectorAll('details[data-rel]').forEach(function (d) {
    var rel = d.getAttribute('data-rel');
    if (Object.prototype.hasOwnProperty.call(stored, rel)) d.open = !!stored[rel];
  });
  var active = tree.querySelector('a.active');
  if (active) {
    var p = active.parentElement;
    while (p && p !== tree) {
      if (p.tagName === 'DETAILS') p.open = true;
      p = p.parentElement;
    }
    active.scrollIntoView({ block: 'nearest' });
  }
  var pending = false;
  tree.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!(d instanceof HTMLDetailsElement)) return;
    var rel = d.getAttribute('data-rel');
    if (!rel) return;
    stored[rel] = d.open;
    if (!pending) {
      pending = true;
      Promise.resolve().then(function () {
        pending = false;
        try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch (_) {}
      });
    }
  }, true);
  var btn = document.querySelector('.canv-nav-toggle');
  if (btn) {
    btn.addEventListener('click', function () {
      document.body.toggleAttribute('data-nav-open');
    });
    tree.addEventListener('click', function (e) {
      if (e.target.closest('a')) document.body.removeAttribute('data-nav-open');
    });
    document.addEventListener('click', function (e) {
      if (!document.body.hasAttribute('data-nav-open')) return;
      if (e.target.closest('.canv-nav') || e.target === btn) return;
      document.body.removeAttribute('data-nav-open');
    });
  }
})();
</script>
` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/__canv/style.css">
</head>
<body>
${navBlock}<main>
${bodyHtml}
</main>
${rootScript}${navScript}<script>
(function () {
  try {
    var es = new EventSource('/__canv/reload');
    es.onmessage = function () { location.reload(); };
  } catch (_) {}
})();
</script>
</body>
</html>
`
}

const http = require('node:http')
const chokidar = require('chokidar')

// marked v5+ is ESM-only; load lazily via dynamic import on first use so this
// CJS module still works under Electron's bundled Node.
let markedPromise = null
function loadMarked() {
  if (!markedPromise) {
    markedPromise = import('marked').then((mod) => {
      // marked v5+ ESM only; configured once per process. Inject id="…" on
      // every heading using the same slug algorithm the wikilink rewriter
      // uses, so [[Page#Heading]] anchors actually land.
      mod.marked.use({
        renderer: {
          heading(token) {
            const text = this.parser.parseInline(token.tokens)
            const plain = text.replace(/<[^>]+>/g, '')
            const id = slugifyHeading(plain)
            const idAttr = id ? ` id="${id}"` : ''
            return `<h${token.depth}${idAttr}>${text}</h${token.depth}>\n`
          },
        },
      })
      return mod.marked
    })
  }
  return markedPromise
}

const ASSET_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif',
  '.mp4', '.webm', '.mp3', '.ogg', '.wav', '.pdf',
  '.css', '.woff', '.woff2', '.ttf', '.otf',
])
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.css': 'text/css; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf',
}

class ServeError extends Error {
  constructor(code, message) { super(message || code); this.code = code; this.name = 'ServeError' }
}

let state = null  // { server, root, watcher, sseClients:Set, pageIndex, url }
const statusListeners = new Set()

function emitStatus() {
  const s = status()
  for (const cb of statusListeners) {
    try { cb(s) } catch { /* ignore */ }
  }
}

function status() {
  if (!state) return { running: false }
  return { running: true, root: state.root, url: state.url }
}

function getNavTree() {
  if (!state) return null
  if (!state.navTree) state.navTree = buildNavTree(state.root)
  return state.navTree
}

function onStatusChange(cb) {
  statusListeners.add(cb)
  return () => statusListeners.delete(cb)
}

function renderMarkdownFile(absPath, currentRel, depth = 0) {
  const src = fs.readFileSync(absPath, 'utf8')
  const html = state.marked.parse(preprocessMarkdown({
    src,
    pageIndex: state.pageIndex,
    currentRel,
    depth,
    renderEmbed: (rel, d) => renderEmbedRecursive(rel, d),
  }))
  return html
}

function renderEmbedRecursive(rel, depth) {
  const abs = path.join(state.root, rel)
  if (!fs.existsSync(abs)) return `<span class="canv-broken">${escapeHtml(rel)}</span>`
  if (depth >= 3) return `<span class="canv-broken">${escapeHtml(rel)}</span>`
  return renderMarkdownFile(abs, rel, depth)
}

function handleRequest(req, res) {
  if (!state) { res.statusCode = 503; res.end(); return }
  let urlPath
  try { urlPath = new URL(req.url, 'http://localhost').pathname }
  catch { res.statusCode = 400; res.end('bad request'); return }

  // Internal endpoints.
  if (urlPath === '/__canv/style.css') {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' })
    res.end(STYLESHEET)
    return
  }
  if (urlPath === '/__canv/reload') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    })
    res.write(': hi\n\n')
    state.sseClients.add(res)
    const close = () => { state && state.sseClients.delete(res) }
    res.on('close', close)
    res.on('error', close)
    return
  }

  const abs = safeResolve(state.root, urlPath)
  if (!abs) { res.statusCode = 404; res.end('not found'); return }

  // Decide what to serve.
  let target = abs
  let isMd = false
  let currentRel
  if (urlPath === '/' || abs === state.root) {
    target = path.join(state.root, 'index.md')
    isMd = true
    currentRel = 'index.md'
  } else {
    let stat = null
    try { stat = fs.statSync(target) } catch { /* missing */ }
    if (stat && stat.isDirectory()) {
      target = path.join(target, 'index.md')
      isMd = true
    } else if (!stat) {
      // Try adding .md (e.g. /Foo → /Foo.md).
      try {
        const withMd = target + '.md'
        if (fs.statSync(withMd).isFile()) { target = withMd; isMd = true }
      } catch { /* still missing */ }
    } else if (/\.(md|markdown)$/i.test(target)) {
      isMd = true
    }
    currentRel = path.relative(state.root, target).split(path.sep).join('/')
  }

  if (isMd) {
    if (!fs.existsSync(target)) { res.statusCode = 404; res.end(htmlError('Not found')); return }
    let bodyHtml
    try { bodyHtml = renderMarkdownFile(target, currentRel, 0) }
    catch (err) {
      res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' })
      res.end(htmlError('Render error: ' + escapeHtml(err.message)))
      return
    }
    const src = fs.readFileSync(target, 'utf8')
    const title = extractTitle(src, path.basename(target))
    const tree = getNavTree()
    const navHtml = tree ? renderNavHtml({ tree, currentRel }) : ''
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(renderHtml({ title, bodyHtml, navHtml, serveRoot: state.root }))
    return
  }

  // Asset.
  const ext = path.extname(target).toLowerCase()
  if (!ASSET_EXTS.has(ext)) { res.statusCode = 404; res.end('not found'); return }
  let stat = null
  try { stat = fs.statSync(target) } catch { /* */ }
  if (!stat || !stat.isFile()) { res.statusCode = 404; res.end('not found'); return }
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(target).pipe(res)
}

function htmlError(msg) {
  return renderHtml({ title: 'Error', bodyHtml: `<h1>Error</h1><p>${msg}</p>` })
}

function makeBroadcaster() {
  const ref = { timer: null }
  const fn = function schedule() {
    if (ref.timer) return
    ref.timer = setTimeout(() => {
      ref.timer = null
      if (!state) return
      for (const res of Array.from(state.sseClients)) {
        try { res.write('data: reload\n\n') } catch { state.sseClients.delete(res) }
      }
    }, 100)
  }
  fn.cancel = () => { if (ref.timer) { clearTimeout(ref.timer); ref.timer = null } }
  return fn
}

async function start(absRoot) {
  if (state) await stop()
  if (!fs.existsSync(path.join(absRoot, 'index.md'))) {
    throw new ServeError('NO_INDEX', 'No index.md found in ' + absRoot)
  }
  const marked = await loadMarked()
  const pageIndex = buildPageIndex(absRoot)
  const server = http.createServer(handleRequest)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
  })
  const port = server.address().port
  const url = `http://127.0.0.1:${port}`
  state = { server, root: absRoot, watcher: null, sseClients: new Set(), pageIndex, url, marked }
  const broadcast = makeBroadcaster()
  state.broadcast = broadcast
  const watcher = chokidar.watch(absRoot, {
    ignored: /(^|[\\/])(\.[^\\/]+|node_modules)([\\/]|$)/,
    ignoreInitial: true,
    persistent: true,
  })
  watcher.on('add',    (p) => {
    if (state) { if (/\.md$/i.test(p)) state.pageIndex.add(p); state.navTree = null }
    broadcast()
  })
  watcher.on('unlink', (p) => {
    if (state) { if (/\.md$/i.test(p)) state.pageIndex.remove(p); state.navTree = null }
    broadcast()
  })
  watcher.on('change', () => broadcast())
  watcher.on('addDir', () => {
    if (state) state.navTree = null
    broadcast()
  })
  watcher.on('unlinkDir', (p) => {
    if (state && p === state.root) { stop().catch(() => {}); return }
    if (state) state.navTree = null
    broadcast()
  })
  watcher.on('error', () => { stop().catch(() => {}) })
  state.watcher = watcher
  await new Promise((resolve) => watcher.once('ready', resolve))
  emitStatus()
  return { url }
}

async function stop() {
  if (!state) return
  const local = state
  state = null
  if (local.broadcast?.cancel) local.broadcast.cancel()
  for (const res of local.sseClients) { try { res.end() } catch { /* ignore */ } }
  local.sseClients.clear()
  if (local.watcher) { try { await local.watcher.close() } catch { /* ignore */ } }
  await new Promise((resolve) => local.server.close(() => resolve()))
  emitStatus()
}

module.exports = {
  // pure helpers
  slugifyHeading,
  safeResolve,
  buildPageIndex,
  buildNavTree,
  renderNavHtml,
  preprocessMarkdown,
  renderHtml,
  extractTitle,
  STYLESHEET,
  IMG_EXTS, AUDIO_EXTS, VIDEO_EXTS,
  // server API
  start,
  stop,
  status,
  onStatusChange,
  ServeError,
  ASSET_EXTS,
}
