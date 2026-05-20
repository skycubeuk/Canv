interface Props<T extends string | number> {
  value: T
  onChange: (v: T) => void
  options: ReadonlyArray<T> | ReadonlyArray<{ value: T; label: string }>
  label: string
  help?: string
}

function isObjectOptions<T extends string | number>(
  opts: Props<T>['options'],
): opts is ReadonlyArray<{ value: T; label: string }> {
  return opts.length > 0 && typeof opts[0] === 'object'
}

export function EnumControl<T extends string | number>({
  value,
  onChange,
  options,
  label,
  help,
}: Props<T>) {
  const opts: ReadonlyArray<{ value: T; label: string }> = isObjectOptions(options)
    ? options
    : (options as ReadonlyArray<T>).map((v) => ({ value: v, label: String(v) }))
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {help && <span className="text-xs text-muted">{help}</span>}
      <select
        className="input"
        value={String(value)}
        onChange={(e) => {
          const match = opts.find((o) => String(o.value) === e.target.value)
          if (match) onChange(match.value)
        }}
      >
        {opts.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
