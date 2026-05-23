import { THEMES } from '../../lib/themes'
import type { ThemeId } from '../../lib/themes'

interface AppearanceSettings {
  theme: ThemeId
  fontSize: number
  chatFontSize: number
}

interface Props {
  settings: AppearanceSettings
  onUpdate: (patch: Partial<AppearanceSettings>) => void
}

const DARK_THEMES = THEMES.filter((t) => t.kind === 'dark')
const LIGHT_THEMES = THEMES.filter((t) => t.kind === 'light')

export function AppearanceSection({ settings, onUpdate }: Props) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs uppercase tracking-wider text-subtle font-semibold">Appearance</h3>

      <div>
        <label htmlFor="appearance-theme" className="block text-sm font-medium mb-2">Theme</label>
        <select
          id="appearance-theme"
          className="input"
          value={settings.theme}
          onChange={(e) => onUpdate({ theme: e.target.value as ThemeId })}
        >
          <option value="system">Match system</option>
          <optgroup label="Dark">
            {DARK_THEMES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </optgroup>
          <optgroup label="Light">
            {LIGHT_THEMES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </optgroup>
        </select>
      </div>

      <div>
        <label htmlFor="appearance-font-size" className="block text-sm font-medium mb-2">
          Font size: {settings.fontSize}px
        </label>
        <input
          id="appearance-font-size"
          type="range"
          min={12}
          max={24}
          step={1}
          value={settings.fontSize}
          onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <label htmlFor="appearance-chat-font-size" className="block text-sm font-medium mb-2">
          Chat font size: {settings.chatFontSize}px
        </label>
        <input
          id="appearance-chat-font-size"
          type="range"
          min={12}
          max={24}
          step={1}
          value={settings.chatFontSize}
          onChange={(e) => onUpdate({ chatFontSize: Number(e.target.value) })}
          className="w-full"
        />
      </div>
    </section>
  )
}
