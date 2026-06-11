#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_SRC = path.join(__dirname, '..', 'skills')
const SKILLS_DST = path.join(os.homedir(), '.claude', 'skills')

// Installs every skill in skills/ (any directory containing a SKILL.md).
// Pass names to install a subset: `npm run skill:install -- canv-extension-author`
async function discoverSkills() {
  const entries = await fs.readdir(SKILLS_SRC, { withFileTypes: true })
  const names = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    try {
      await fs.access(path.join(SKILLS_SRC, e.name, 'SKILL.md'))
      names.push(e.name)
    } catch { /* not a skill folder */ }
  }
  return names
}

async function installOne(name) {
  const src = path.join(SKILLS_SRC, name)
  const dst = path.join(SKILLS_DST, name)
  let existed = false
  try {
    await fs.access(dst)
    existed = true
    await fs.rm(dst, { recursive: true, force: true })
  } catch { /* fresh install */ }
  await fs.cp(src, dst, { recursive: true })
  console.log(`${existed ? 'Reinstalled' : 'Installed'} ${name} -> ${dst}`)
}

async function main() {
  const requested = process.argv.slice(2)
  const available = await discoverSkills()
  if (available.length === 0) {
    console.error(`No skills found in ${SKILLS_SRC}`)
    process.exit(1)
  }

  const targets = requested.length ? requested : available
  const unknown = targets.filter((n) => !available.includes(n))
  if (unknown.length) {
    console.error(`Unknown skill(s): ${unknown.join(', ')}`)
    console.error(`Available: ${available.join(', ')}`)
    process.exit(1)
  }

  await fs.mkdir(SKILLS_DST, { recursive: true })
  for (const name of targets) await installOne(name)

  console.log('')
  console.log('Open Claude Code and the skills will be available via the Skill tool.')
}

main().catch((err) => {
  console.error('install-skill failed:', err.message || err)
  process.exit(1)
})
