'use strict'
const fs = require('node:fs')
const path = require('node:path')

const PROMPT_PATH = path.join(__dirname, '..', '..', '..', 'src', 'agents', 'extensionBuilder.system.md')

function loadSystemPrompt() {
  return fs.readFileSync(PROMPT_PATH, 'utf-8')
}

module.exports = { loadSystemPrompt, PROMPT_PATH }
