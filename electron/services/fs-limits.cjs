'use strict'

// Maximum byte size for any file Canv will open in the editor or expose to tools.
// Files over this size are refused with a structured `too-large` error, never read.
const MAX_OPEN_BYTES = 10 * 1024 * 1024 // 10 MB

module.exports = { MAX_OPEN_BYTES }
