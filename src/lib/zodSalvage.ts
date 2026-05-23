import { z } from 'zod'

export interface SalvageResult<T> {
  value: T
  /** Dot-paths of fields that were present in `raw` but failed to parse, and
   *  therefore got replaced with the schema's default. Absent fields are NOT
   *  listed — they're treated as a clean default, not a drop. */
  dropped: string[]
}

/**
 * Per-field safeParse against a Zod object schema. Every top-level field must
 * have a default (`.default(...)` somewhere in its chain) so we can recover.
 *
 * Why per-field: the hand-coded merge in useSettings.ts already preserves
 * valid sibling fields when one entry is broken (e.g. pricingOverrides
 * upgrade). A whole-blob hard-fail would lose API keys on a single bad
 * lintRules toggle — friendlier UX is to salvage what's valid.
 */
export function salvage<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  raw: unknown,
): SalvageResult<z.infer<T>> {
  const shape = schema.shape
  const rawObj = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
  const out: Record<string, unknown> = {}
  const dropped: string[] = []

  for (const key of Object.keys(shape)) {
    const fieldSchema = shape[key] as z.ZodType
    const present = key in rawObj
    const r = fieldSchema.safeParse(rawObj[key])
    if (r.success) {
      out[key] = r.data
    } else {
      const dr = fieldSchema.safeParse(undefined)
      if (!dr.success) {
        throw new Error(`zodSalvage: field "${key}" has no default value`)
      }
      out[key] = dr.data
      if (present) dropped.push(key)
    }
  }

  return { value: out as z.infer<T>, dropped }
}
