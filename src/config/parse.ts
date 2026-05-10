import { parse as parseYaml } from 'yaml'
import type { ZodIssue } from 'zod'
import { modeSchema } from './schema'
import type { ConfigError, Mode, ParseResult, RawAction, RawMode } from './types'
import { lookupIcon, suggestIcon } from './iconRegistry'

export interface ModeFileInput {
  /** Filename relative to the config dir (e.g. "fiction.yaml"). */
  file: string
  /** Raw YAML content. */
  content: string
}

interface ParsedFile {
  file: string
  raw: RawMode
}

export function parseModeFiles(inputs: ModeFileInput[]): ParseResult {
  if (inputs.length === 0) {
    return {
      ok: false,
      errors: [{ file: '', field: '', message: 'no mode files found in config folder' }],
    }
  }

  const errors: ConfigError[] = []
  const parsed: ParsedFile[] = []

  for (const { file, content } of inputs) {
    let yaml: unknown
    try {
      yaml = parseYaml(content)
    } catch (err) {
      errors.push({ file, field: '', message: `invalid YAML — ${(err as Error).message}` })
      continue
    }

    const result = modeSchema.safeParse(yaml)
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(zodIssueToConfigError(file, issue))
      }
      continue
    }

    // Icon validation (separate from Zod so we can attach did-you-mean).
    let iconErrors = false
    if (!lookupIcon(result.data.icon)) {
      errors.push({ file, field: 'icon', message: iconMessage(result.data.icon) })
      iconErrors = true
    }
    result.data.actions.forEach((a, idx) => {
      if (!lookupIcon(a.icon)) {
        errors.push({ file, field: `actions[${idx}].icon`, message: iconMessage(a.icon) })
        iconErrors = true
      }
    })

    // Per-file action id uniqueness.
    const seen = new Map<string, number>()
    let dupErrors = false
    result.data.actions.forEach((a, idx) => {
      const prev = seen.get(a.id)
      if (prev !== undefined) {
        errors.push({
          file,
          field: 'actions',
          message: `duplicate action id "${a.id}" (at index ${prev} and ${idx})`,
        })
        dupErrors = true
      } else {
        seen.set(a.id, idx)
      }
    })

    if (!iconErrors && !dupErrors) parsed.push({ file, raw: result.data })
  }

  // Cross-file validation
  if (parsed.length > 0) {
    const idToFile = new Map<string, string>()
    for (const { file, raw } of parsed) {
      const existing = idToFile.get(raw.id)
      if (existing !== undefined) {
        errors.push({
          file: '',
          field: '',
          message: `duplicate mode id "${raw.id}" (in ${existing} and ${file})`,
        })
      } else {
        idToFile.set(raw.id, file)
      }
    }

    const defaults = parsed.filter((p) => p.raw.default)
    if (defaults.length === 0) {
      errors.push({
        file: '',
        field: '',
        message: 'exactly one mode must have `default: true` (found 0)',
      })
    } else if (defaults.length > 1) {
      const ids = defaults.map((d) => d.raw.id).join(', ')
      errors.push({
        file: '',
        field: '',
        message: `exactly one mode must have \`default: true\` (found ${defaults.length}: ${ids})`,
      })
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  // Resolve icons and sort.
  const modes: Mode[] = parsed.map(({ raw }) => resolveIcons(raw))
  modes.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  return { ok: true, modes }
}

function resolveIcons(raw: RawMode): Mode {
  return {
    ...raw,
    icon: lookupIcon(raw.icon)!, // validated above
    actions: raw.actions.map(resolveActionIcon),
  }
}

function resolveActionIcon(raw: RawAction) {
  return { ...raw, icon: lookupIcon(raw.icon)! }
}

function iconMessage(name: string): string {
  const suggestion = suggestIcon(name)
  if (suggestion) return `"${name}" is not a known Lucide icon (did you mean "${suggestion}"?)`
  return `"${name}" is not a known Lucide icon`
}

function zodIssueToConfigError(file: string, issue: ZodIssue): ConfigError {
  const field = issue.path
    .map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? seg : `.${seg}`))
    .join('')
  return { file, field, message: issue.message }
}
