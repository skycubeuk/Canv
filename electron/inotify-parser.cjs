const DEDUP_MS = 50
const SKIP_RE = /(^|\/)(\.git|node_modules)(\/|$)/

function toRel(root, abs) {
  if (!abs.startsWith(root)) return null
  let r = abs.slice(root.length)
  if (r.startsWith('/')) r = r.slice(1)
  return r
}

function createParser({ root, now = () => Date.now() }) {
  let buf = ''
  let listener = () => {}
  const lastChange = new Map()
  function emit(ev) {
    if (ev.relPath == null || SKIP_RE.test(ev.relPath)) return
    if (ev.type === 'change') {
      const last = lastChange.get(ev.relPath) ?? -Infinity
      const t = now()
      if (t - last < DEDUP_MS) return
      lastChange.set(ev.relPath, t)
    }
    listener(ev)
  }

  function handleLine(line) {
    line = line.trim()
    if (!line) return
    const space = line.indexOf(' ')
    if (space === -1) return
    const flags = line.slice(0, space).split(',')
    const abs = line.slice(space + 1)
    const rel = toRel(root, abs)
    if (rel == null) return
    const isDir = flags.includes('ISDIR')
    if (flags.includes('CREATE')) emit({ type: isDir ? 'addDir' : 'add', relPath: rel })
    else if (flags.includes('DELETE')) emit({ type: isDir ? 'unlinkDir' : 'unlink', relPath: rel })
    else if (flags.includes('MODIFY') || flags.includes('CLOSE_WRITE')) emit({ type: 'change', relPath: rel })
    else if (flags.includes('MOVED_FROM')) {
      emit({ type: isDir ? 'unlinkDir' : 'unlink', relPath: rel })
    } else if (flags.includes('MOVED_TO')) {
      emit({ type: isDir ? 'addDir' : 'add', relPath: rel })
    }
  }

  return {
    feed(chunk) {
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) !== -1) {
        handleLine(buf.slice(0, nl))
        buf = buf.slice(nl + 1)
      }
    },
    flush() {
      if (buf) { handleLine(buf); buf = '' }
    },
    onEvent(cb) { listener = cb },
  }
}

module.exports = { createParser }
