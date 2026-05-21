import type { ReactNode } from 'react'
import { z } from 'zod'
import { TextControl } from './controls/TextControl'
import { NumberControl } from './controls/NumberControl'
import { SwitchControl } from './controls/SwitchControl'
import { EnumControl } from './controls/EnumControl'
import { ArrayOfObjectsControl } from './controls/ArrayOfObjectsControl'
import { DiscriminatedUnionControl } from './controls/DiscriminatedUnionControl'
import { JsonValueControl } from './controls/JsonValueControl'
import { MCPRowExtrasHeader } from './mcp/MCPRowExtrasHeader'
import { MCPRowExtrasPanel } from './mcp/MCPRowExtrasPanel'
import { useMcpServerStatus } from './mcp/useMcpServerStatus'
import type { RowExtrasConfig } from './controls/ArrayOfObjectsControl'
import type { SettingsFieldMeta } from '../../hooks/settingsSchema'

interface Props<T extends z.ZodObject<z.ZodRawShape>> {
  schema: T
  value: z.infer<T>
  onChange: (patch: Partial<z.infer<T>>) => void
  /** Only sections matching the filter are rendered. Default: render everything. */
  sectionFilter?: (section: string) => boolean
}

/**
 * Walks a Zod object schema and renders one control per field that declares
 * `meta.ui === 'auto'` (and isn't hidden). Groups by `meta.section`. Anything
 * the renderer doesn't understand is logged and skipped — the auto-gen surface
 * is deliberately small (string/number/boolean/enum/literal-union/array of
 * objects/discriminated union).
 *
 * Zod 4.4 internals reached here: `_def.type` (string tag), `_def.innerType`,
 * `_def.defaultValue`, `_def.element`, `_def.entries`, `_def.values`,
 * `_def.options`, `_def.discriminator`, `_def.checks[]._zod.def`. There is no
 * stable public introspection API yet; if a future Zod release moves these
 * the renderer fails closed via the warn-and-skip branch.
 */
export function SchemaSettingsForm<T extends z.ZodObject<z.ZodRawShape>>({
  schema,
  value,
  onChange,
  sectionFilter,
}: Props<T>) {
  const obj = value as unknown as Record<string, unknown>
  // Top-level onChange emits a partial (one key) so consumers can pass it
  // straight to `useSettings.update(...)`. Nested forms (variants / array items)
  // use the full-object onChange shape because the parent control wraps them.
  return (
    <>
      {renderTopLevel(schema, obj, (patch) => onChange(patch as Partial<z.infer<T>>), sectionFilter)}
    </>
  )
}

// ─── internals ─────────────────────────────────────────────────────────────

interface ZodTypeWithDef {
  _def?: {
    type?: string
    innerType?: z.ZodTypeAny
    defaultValue?: unknown
    element?: z.ZodTypeAny
    entries?: Record<string, string | number>
    values?: ReadonlyArray<string | number>
    options?: z.ZodTypeAny[]
    discriminator?: string
    checks?: Array<{ _zod?: { def?: { check?: string; value?: number } } }>
  }
}

function defOf(s: z.ZodTypeAny): ZodTypeWithDef['_def'] {
  return (s as ZodTypeWithDef)._def
}

function unwrapDefault(s: z.ZodTypeAny): z.ZodTypeAny {
  const d = defOf(s)
  if (d?.type === 'default' && d.innerType) return unwrapDefault(d.innerType)
  return s
}

function unwrapOptional(s: z.ZodTypeAny): z.ZodTypeAny {
  const d = defOf(s)
  if (d?.type === 'optional' && d.innerType) return unwrapOptional(d.innerType)
  return s
}

/**
 * Strip both `.optional()` and `.default(...)` wraps — the renderer always
 * cares about the innermost shape. The triple wrap converges both orderings
 * (`.default().optional()` and `.optional().default()`) in one pass.
 */
function unwrapAll(s: z.ZodTypeAny): z.ZodTypeAny {
  return unwrapDefault(unwrapOptional(unwrapDefault(s)))
}

/**
 * Primitive scalars (string / number / boolean) — does NOT include enum, which
 * has its own EnumControl. Used by the array dispatch to decide between
 * `JsonValueControl` (textarea over a primitive list) and
 * `ArrayOfObjectsControl` (row-of-rows over object items).
 */
function isPrimitiveSchema(s: z.ZodTypeAny): boolean {
  const u = unwrapAll(s)
  return u instanceof z.ZodString
      || u instanceof z.ZodNumber
      || u instanceof z.ZodBoolean
}

function readMeta(s: z.ZodTypeAny): SettingsFieldMeta {
  const meta = (s as z.ZodTypeAny & { meta?: () => unknown }).meta?.()
  return (meta ?? {}) as SettingsFieldMeta
}

function renderTopLevel(
  schema: z.ZodObject<z.ZodRawShape>,
  value: Record<string, unknown>,
  onPatch: (patch: Record<string, unknown>) => void,
  sectionFilter?: (section: string) => boolean,
): ReactNode {
  const sections = new Map<string, ReactNode[]>()

  for (const key of Object.keys(schema.shape)) {
    const field = schema.shape[key] as z.ZodTypeAny
    const meta = readMeta(field)
    if (meta.ui !== 'auto' || meta.hidden) continue
    const section = meta.section ?? 'general'
    if (sectionFilter && !sectionFilter(section)) continue
    const arr = sections.get(section) ?? []
    arr.push(renderField(key, key, field, value[key], (next) => onPatch({ [key]: next }), meta))
    sections.set(section, arr)
  }

  return Array.from(sections.entries()).map(([section, nodes]) => (
    <section key={section} className="flex flex-col gap-3 mt-2">
      {nodes}
    </section>
  ))
}

/**
 * Render the contents of an object schema without the section grouping wrapper
 * — used for nested forms (one variant of a discriminated union, an item in an
 * array). Every field renders regardless of `meta.section`.
 */
function renderObjectInline(
  schema: z.ZodObject<z.ZodRawShape>,
  value: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  parentPath: string,
): ReactNode {
  const nodes: ReactNode[] = []
  for (const key of Object.keys(schema.shape)) {
    const field = schema.shape[key] as z.ZodTypeAny
    const inner = unwrapAll(field)
    // Skip the discriminator field — that's handled by DiscriminatedUnionControl's tabs.
    if (defOf(inner)?.type === 'literal') continue
    const meta = readMeta(field)
    const label = meta.label ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
    const childPath = `${parentPath}.${key}`
    nodes.push(renderField(key, childPath, field, value[key], (next) => onChange({ ...value, [key]: next }), { ...meta, label }))
  }
  return <div className="flex flex-col gap-2">{nodes}</div>
}

function renderField(
  key: string,
  path: string,
  field: z.ZodTypeAny,
  value: unknown,
  setField: (next: unknown) => void,
  meta: SettingsFieldMeta,
): ReactNode {
  const inner = unwrapAll(field)
  const innerType = defOf(inner)?.type
  const label = meta.label ?? key
  const help = meta.help

  // String
  if (inner instanceof z.ZodString) {
    return (
      <TextControl
        key={key}
        label={label}
        help={help}
        value={(value as string) ?? ''}
        onChange={(v) => setField(v)}
      />
    )
  }

  // Number — pull min/max from the checks list (Zod 4.4 stores bounds under check._zod.def).
  if (inner instanceof z.ZodNumber) {
    const checks = defOf(inner)?.checks ?? []
    let min: number | undefined
    let max: number | undefined
    for (const c of checks) {
      const cd = c?._zod?.def
      if (!cd) continue
      if (cd.check === 'greater_than') min = cd.value
      else if (cd.check === 'less_than') max = cd.value
    }
    return (
      <NumberControl
        key={key}
        label={label}
        help={help}
        value={(value as number) ?? 0}
        onChange={(v) => setField(v)}
        min={min}
        max={max}
      />
    )
  }

  // Boolean
  if (inner instanceof z.ZodBoolean) {
    return (
      <SwitchControl
        key={key}
        label={label}
        help={help}
        value={(value as boolean) ?? false}
        onChange={(v) => setField(v)}
      />
    )
  }

  // Enum — Zod 4.4 exposes `_def.entries` (object) instead of a `values` array.
  if (inner instanceof z.ZodEnum) {
    const entries = defOf(inner)?.entries ?? {}
    const opts = Object.values(entries) as string[]
    return (
      <EnumControl
        key={key}
        label={label}
        help={help}
        value={(value as string) ?? opts[0]}
        onChange={(v) => setField(v)}
        options={opts}
      />
    )
  }

  // Union of literals (e.g. StreamDelay = 0|50|100|200) → enum picker.
  if (inner instanceof z.ZodUnion) {
    const options = defOf(inner)?.options ?? []
    const literals: Array<string | number> = []
    for (const opt of options) {
      if (defOf(opt)?.type === 'literal') {
        const values = defOf(opt)?.values
        if (values && values.length === 1) literals.push(values[0])
      }
    }
    if (literals.length === options.length && literals.length > 0) {
      return (
        <EnumControl
          key={key}
          label={label}
          help={help}
          value={(value as string | number) ?? literals[0]}
          onChange={(v) => setField(v)}
          options={literals as ReadonlyArray<string | number>}
        />
      )
    }
  }

  // Record / map (e.g. env, headers) → JsonValueControl. The auto-gen form
  // intentionally doesn't try to draw a row-per-entry editor for arbitrary
  // string maps; a JSON textarea is the simplest editable surface.
  if (inner instanceof z.ZodRecord) {
    return (
      <JsonValueControl
        key={key}
        label={label}
        help={help}
        value={value}
        onChange={(v) => setField(v)}
        schema={inner}
      />
    )
  }

  // Array — split by element type. Primitives → JsonValueControl (textarea).
  // Objects / discriminated unions → ArrayOfObjectsControl (row-of-rows).
  if (inner instanceof z.ZodArray) {
    // For the primitive check we look at the schema's *real* element type.
    // `meta.itemSchema` is the storage-vs-editor override and is always an
    // object schema, so the primitive branch should never consult it.
    const schemaElem = defOf(inner)?.element
    if (schemaElem && isPrimitiveSchema(schemaElem)) {
      return (
        <JsonValueControl
          key={key}
          label={label}
          help={help}
          value={value}
          onChange={(v) => setField(v)}
          schema={inner}
        />
      )
    }
    // meta.itemSchema overrides the schema's _def.element. Used when the
    // storage shape is intentionally permissive (z.array(z.unknown())) so
    // salvage doesn't wipe the array on a single partially-typed entry,
    // but the editor still needs a real per-item schema to dispatch on.
    const elem = meta.itemSchema ?? schemaElem
    if (!elem) {
      console.warn(`[SchemaSettingsForm] array "${path}" has no element schema. Deferred.`)
      return null
    }
    const arr = (Array.isArray(value) ? value : []) as unknown[]
    const itemPath = `${path}[]`
    const rowExtrasConfig = meta.rowExtras === 'mcp' ? MCP_ROW_EXTRAS : undefined
    return (
      <ArrayOfObjectsControl
        key={key}
        label={label}
        help={help}
        value={arr}
        onChange={(v) => setField(v)}
        itemSchema={elem}
        itemLabel={meta.itemLabel}
        createItem={() => makeDefault(elem)}
        renderItemForm={(itemSchema, item, onItemChange) => renderItem(itemSchema, item, onItemChange, itemPath)}
        renderRowExtras={rowExtrasConfig}
      />
    )
  }

  // Anything else — deliberately skipped. The surface is restricted on purpose.
  console.warn(`[SchemaSettingsForm] no control for "${path}" (zod type: ${innerType}). Deferred.`)
  return null
}

function renderItem(
  schema: z.ZodTypeAny,
  item: unknown,
  onChange: (next: unknown) => void,
  path: string,
): ReactNode {
  const inner = unwrapAll(schema)
  const itemObj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
  const setRecord = (next: Record<string, unknown>) => onChange(next)

  if (inner instanceof z.ZodDiscriminatedUnion) {
    const discriminator = defOf(inner)?.discriminator ?? 'kind'
    const variantSchemas = (defOf(inner)?.options ?? []) as z.ZodObject<z.ZodRawShape>[]
    const variants = variantSchemas
      .map((opt) => {
        const litField = opt.shape[discriminator] as z.ZodTypeAny | undefined
        const lits = litField ? defOf(unwrapAll(litField))?.values : undefined
        if (!lits || lits.length === 0) return null
        return { literal: String(lits[0]), schema: opt }
      })
      .filter((v): v is { literal: string; schema: z.ZodObject<z.ZodRawShape> } => v !== null)
    if (variants.length === 0) {
      console.warn(`[SchemaSettingsForm] no control for "${path}" (zod type: discriminated union with no inspectable literals). Deferred.`)
      return null
    }
    return (
      <DiscriminatedUnionControl
        value={itemObj}
        onChange={setRecord}
        discriminator={discriminator}
        variants={variants}
        renderVariantForm={(varSchema, v, onV) => renderObjectInline(varSchema, v, onV, path)}
        makeVariantDefault={(literal) => {
          const variant = variants.find((vt) => vt.literal === literal)
          if (!variant) return { [discriminator]: literal }
          return makeDefault(variant.schema) as Record<string, unknown>
        }}
      />
    )
  }

  if (inner instanceof z.ZodObject) {
    return renderObjectInline(inner, itemObj, setRecord, path)
  }

  console.warn(`[SchemaSettingsForm] no control for "${path}" (zod type: non-object item ${defOf(inner)?.type}). Deferred.`)
  return null
}

// Stable module-scope reference so the ArrayOfObjectsControl's row-extras
// config prop doesn't change identity on every render. The state type is
// `unknown` at the slot boundary; we cast back inside the renderers.
type McpRowState = ReturnType<typeof useMcpServerStatus>
const MCP_ROW_EXTRAS: RowExtrasConfig<unknown> = {
  useRowState: (item, _idx, helpers) => useMcpServerStatus(item, helpers.onCollapsed),
  header: (state, helpers) => (
    <MCPRowExtrasHeader state={state as McpRowState} isExpanded={helpers.isExpanded} />
  ),
  panel: (state) => <MCPRowExtrasPanel state={state as McpRowState} />,
}

function makeDefault(schema: z.ZodTypeAny): unknown {
  const d = defOf(schema)
  if (d?.type === 'default') {
    const dv = d.defaultValue
    return typeof dv === 'function' ? (dv as () => unknown)() : dv
  }
  if (schema instanceof z.ZodOptional) {
    return undefined
  }
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const first = (d?.options as z.ZodObject<z.ZodRawShape>[] | undefined)?.[0]
    if (!first) return {}
    return makeDefault(first)
  }
  if (schema instanceof z.ZodObject) {
    const stub: Record<string, unknown> = {}
    for (const k of Object.keys(schema.shape)) {
      const sub = schema.shape[k] as z.ZodTypeAny
      const v = makeDefault(sub)
      if (v !== undefined) stub[k] = v
    }
    return stub
  }
  if (schema instanceof z.ZodString) return ''
  if (schema instanceof z.ZodNumber) return 0
  if (schema instanceof z.ZodBoolean) return false
  if (schema instanceof z.ZodArray) return []
  if (schema instanceof z.ZodLiteral) {
    const values = d?.values
    return values && values.length > 0 ? values[0] : undefined
  }
  if (schema instanceof z.ZodEnum) {
    const entries = d?.entries
    if (entries) {
      const vals = Object.values(entries)
      return vals[0]
    }
    return undefined
  }
  return undefined
}
