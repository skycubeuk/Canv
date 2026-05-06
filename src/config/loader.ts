import { isElectron } from '../lib/fs'
import { BUNDLED_DEFAULTS } from './defaults'
import { parseModeFiles } from './parse'
import type { ParseResult } from './types'

/**
 * Loads + parses every mode file, branching on the runtime target.
 *
 * - In Electron, asks the main process for the contents of the user's config
 *   folder (which has been seeded on first run).
 * - In the web preview (no fs access), uses the bundled defaults frozen at
 *   build time. The web build cannot be customised.
 */
export async function loadModes(): Promise<ParseResult> {
  if (isElectron() && window.canvConfig) {
    const { configDir, files } = await window.canvConfig.list()
    const result = parseModeFiles(files)
    if (!result.ok) return { ...result, configDir }
    return result
  }
  return parseModeFiles(BUNDLED_DEFAULTS)
}
