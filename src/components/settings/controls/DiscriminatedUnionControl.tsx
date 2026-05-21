import type { ReactNode } from 'react'
import type { z } from 'zod'

interface Variant {
  literal: string
  schema: z.ZodObject<z.ZodRawShape>
}

interface Props {
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  /** The discriminator key (e.g. 'transport'). */
  discriminator: string
  /** All variant schemas, keyed by the discriminator literal value. */
  variants: ReadonlyArray<Variant>
  /** Renderer the parent passes in. */
  renderVariantForm: (
    schema: z.ZodObject<z.ZodRawShape>,
    value: Record<string, unknown>,
    onChange: (v: Record<string, unknown>) => void,
  ) => ReactNode
  /** Factory the parent supplies for a brand-new value of the given variant.
   *  Used when switching between variants so we land on a valid shape. */
  makeVariantDefault: (variantLiteral: string) => Record<string, unknown>
}

export function DiscriminatedUnionControl({
  value,
  onChange,
  discriminator,
  variants,
  renderVariantForm,
  makeVariantDefault,
}: Props) {
  const currentLiteral = String(value?.[discriminator] ?? variants[0]?.literal ?? '')
  const currentVariant =
    variants.find((v) => v.literal === currentLiteral) ?? variants[0]

  if (!currentVariant) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 flex-wrap" role="tablist">
        {variants.map((v) => {
          const active = v.literal === currentLiteral
          return (
            <button
              key={v.literal}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                if (active) return
                const defaults = makeVariantDefault(v.literal)
                // Carry over common shared fields (notably `name`) so swapping
                // transports doesn't wipe the user's chosen label.
                const carry: Record<string, unknown> = {}
                if (typeof value?.name === 'string') carry.name = value.name
                onChange({ ...defaults, ...carry, [discriminator]: v.literal })
              }}
              className={`btn-secondary text-xs ${active ? 'ring-1 ring-accent' : ''}`}
            >
              {v.literal}
            </button>
          )
        })}
      </div>
      {renderVariantForm(currentVariant.schema, value, onChange)}
    </div>
  )
}
