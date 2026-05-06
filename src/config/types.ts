import type { LucideIcon } from 'lucide-react'
import type { z } from 'zod'
import type { actionSchema, modeSchema } from './schema'

/** As parsed from YAML (icon is still a string). */
export type RawAction = z.infer<typeof actionSchema>
export type RawMode = z.infer<typeof modeSchema>

/** As consumed by the renderer (icon resolved to a Lucide component). */
export type Action = Omit<RawAction, 'icon'> & { icon: LucideIcon }
export type Mode = Omit<RawMode, 'icon' | 'actions'> & {
  icon: LucideIcon
  actions: Action[]
}

export interface ConfigError {
  /** Filename relative to the config dir (e.g. "fiction.yaml"). */
  file: string
  /**
   * Field path inside the file, e.g. "actions[2].icon".
   * Empty string for file-level errors (parse failure, missing required field).
   */
  field: string
  message: string
}

export type ParseResult =
  | { ok: true; modes: Mode[] }
  | { ok: false; errors: ConfigError[]; configDir?: string }
