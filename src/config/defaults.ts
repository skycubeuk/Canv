import fictionYaml from '../../electron/defaults/fiction.yaml?raw'
import factualYaml from '../../electron/defaults/factual.yaml?raw'
import technicalYaml from '../../electron/defaults/technical.yaml?raw'
import type { ModeFileInput } from './parse'

/**
 * The three bundled mode files as raw YAML strings, in their canonical seeding
 * order. The Electron main process reads the same files from disk for first-run
 * seeding; the renderer uses these for the web build (which has no fs access).
 */
export const BUNDLED_DEFAULTS: ModeFileInput[] = [
  { file: 'fiction.yaml', content: fictionYaml },
  { file: 'factual.yaml', content: factualYaml },
  { file: 'technical.yaml', content: technicalYaml },
]
