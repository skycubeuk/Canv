import { useEffect, useRef, useState } from 'react'
import type { z } from 'zod'

interface Props {
  label: string
  help?: string
  value: unknown
  onChange: (next: unknown) => void
  schema: z.ZodTypeAny
}

function stringify(v: unknown): string {
  return v === undefined ? '' : JSON.stringify(v, null, 2)
}

/**
 * Edits a single JSON-shaped value (primitive array, record map, etc.) via a
 * textarea. Holds a draft string locally so partial / mid-edit input isn't
 * clobbered by re-renders. Only emits `onChange` once the draft parses AND
 * passes the supplied schema. Clearing the textarea emits `undefined` so the
 * caller can drop the key from storage.
 *
 * Used by `SchemaSettingsForm` for `z.array(primitive)` and `z.record(...)`
 * fields where a row-of-rows UI would be overkill.
 */
export function JsonValueControl({ label, help, value, onChange, schema }: Props) {
  const [draft, setDraft] = useState(() => stringify(value))
  const [error, setError] = useState<string | null>(null)
  // Track the most recent value we emitted so the sync-from-prop effect can
  // tell "external change" apart from "our own change" and avoid clobbering
  // the user's in-progress draft.
  const lastEmittedRef = useRef<string>(stringify(value))

  useEffect(() => {
    const next = stringify(value)
    if (next !== lastEmittedRef.current) {
      setDraft(next)
      setError(null)
      lastEmittedRef.current = next
    }
  }, [value])

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {help && <span className="text-xs text-muted">{help}</span>}
      <textarea
        rows={4}
        value={draft}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          if (next.trim() === '') {
            onChange(undefined)
            lastEmittedRef.current = ''
            setError(null)
            return
          }
          let parsed: unknown
          try {
            parsed = JSON.parse(next)
          } catch {
            setError('Invalid JSON')
            return
          }
          const r = schema.safeParse(parsed)
          if (!r.success) {
            setError(r.error.issues[0]?.message ?? 'invalid shape')
            return
          }
          onChange(r.data)
          lastEmittedRef.current = stringify(r.data)
          setError(null)
        }}
        className={`input font-mono text-xs ${error ? 'border-red-500' : ''}`}
        spellCheck={false}
      />
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </label>
  )
}
