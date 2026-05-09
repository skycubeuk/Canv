'use strict'

const path = require('node:path')
const fs = require('node:fs')

// Convert a glob pattern (supports * and ** only) to a RegExp.
function globToRegExp(pattern) {
  let re = '^'
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*'
      i++
      if (pattern[i + 1] === '/') i++
    } else if (c === '*') {
      re += '[^/]*'
    } else if (c === '?') {
      re += '[^/]'
    } else if ('+()^$.|{}[]\\'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  re += '$'
  return new RegExp(re)
}

function listAllFiles(rootAbs) {
  const out = []
  function walk(absDir, relDir) {
    let entries
    try { entries = fs.readdirSync(absDir, { withFileTypes: true }) }
    catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const abs = path.join(absDir, e.name)
      const rel = relDir ? `${relDir}/${e.name}` : e.name
      if (e.isDirectory()) walk(abs, rel)
      else if (e.isFile()) out.push({ abs, rel })
    }
  }
  walk(rootAbs, '')
  return out
}

function maxMtimeForGlobs(rootAbs, globs) {
  if (!Array.isArray(globs) || globs.length === 0) return 0
  const regexes = globs.map(globToRegExp)
  const files = listAllFiles(rootAbs)
  let max = 0
  for (const { abs, rel } of files) {
    if (regexes.some((re) => re.test(rel))) {
      try {
        const stat = fs.statSync(abs)
        if (stat.mtimeMs > max) max = stat.mtimeMs
      } catch { /* */ }
    }
  }
  return max
}

module.exports = { globToRegExp, maxMtimeForGlobs }
