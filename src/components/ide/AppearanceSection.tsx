import { ACCENTS } from '../../lib/accent'
import type { Theme } from '../../hooks/useSettings'

interface AppearanceSettings {
  theme: Theme
  accent: string
  fontSize: number
}

interface Props {
  settings: AppearanceSettings
  onUpdate: (patch: Partial<AppearanceSettings>) => void
}

const THEMES: Theme[] = ['dark', 'light', 'system']

export function AppearanceSection({ settings, onUpdate }: Props) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs uppercase tracking-wider text-subtle font-semibold">Appearance</h3>

      <div>
        <div className="text-sm font-medium mb-2">Theme</div>
        <div role="radiogroup" aria-label="Theme" className="flex gap-2">
          {THEMES.map((t) => (
            <label
              key={t}
              className={`px-3 py-1.5 rounded-md text-sm cursor-pointer border ${
                settings.theme === t
                  ? 'border-accent bg-elev text-default'
                  : 'border-default text-muted hover:bg-hover'
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={t}
                checked={settings.theme === t}
                onChange={() => onUpdate({ theme: t })}
                className="sr-only"
              />
              {t === 'dark' ? 'Dark' : t === 'light' ? 'Light' : 'System'}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Accent</div>
        <div className="flex gap-2">
          {ACCENTS.map((a) => {
            const selected = settings.accent.toLowerCase() === a.hex.toLowerCase()
            return (
              <button
                key={a.hex}
                type="button"
                aria-label={`Accent ${a.name}`}
                data-accent={a.hex}
                onClick={() => onUpdate({ accent: a.hex })}
                className={`w-6 h-6 rounded-full transition ${
                  selected ? 'ring-2 ring-offset-2 ring-offset-app' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: a.hex, ['--tw-ring-color' as string]: a.hex }}
                title={a.name}
              />
            )
          })}
        </div>
      </div>

      <div>
        <label htmlFor="appearance-font-size" className="block text-sm font-medium mb-2">
          Font size: {settings.fontSize}px
        </label>
        <input
          id="appearance-font-size"
          type="range"
          min={12}
          max={22}
          step={1}
          value={settings.fontSize}
          onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
          className="w-full"
        />
      </div>
    </section>
  )
}
