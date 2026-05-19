'use strict'

function extOf(p) {
  if (typeof p !== 'string') return ''
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i).toLowerCase() : ''
}

function matchesWhen(clause, target) {
  if (clause == null || clause === '') return true
  if (typeof clause !== 'string') return false
  if (clause === 'isDir') return !!target.isDir
  if (clause === 'isFile') return !target.isDir
  if (clause.startsWith('fileExt:')) {
    const want = clause.slice('fileExt:'.length).toLowerCase()
    return !target.isDir && extOf(target.relPath) === want
  }
  return false
}

module.exports = { matchesWhen }
