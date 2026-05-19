#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_NAME = 'canv-extension-author'
const SRC = path.join(__dirname, '..', 'skills', SKILL_NAME)
const DST = path.join(os.homedir(), '.claude', 'skills', SKILL_NAME)

async function main() {
  try {
    await fs.access(SRC)
  } catch {
    console.error(`Source not found: ${SRC}`)
    process.exit(1)
  }

  await fs.mkdir(path.dirname(DST), { recursive: true })

  let existed = false
  try {
    await fs.access(DST)
    existed = true
    await fs.rm(DST, { recursive: true, force: true })
  } catch { /* fresh install */ }

  await fs.cp(SRC, DST, { recursive: true })

  console.log(`${existed ? 'Reinstalled' : 'Installed'} canv-extension-author skill at:`)
  console.log(`  ${DST}`)
  console.log('')
  console.log('Open Claude Code in a workspace and ask it to build a Canv extension.')
}

main().catch((err) => {
  console.error('install-skill failed:', err.message || err)
  process.exit(1)
})
