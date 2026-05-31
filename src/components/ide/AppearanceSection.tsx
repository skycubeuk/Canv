import { THEMES } from '../../lib/themes'
import type { ThemeId } from '../../lib/themes'
import type { AiChangesDisplay } from '../../hooks/settingsSchema'

interface AppearanceSettings {
  theme: ThemeId
  fontSize: number
  chatFontSize: number
  aiChangesDisplay: AiChangesDisplay
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

      <div>
        <label htmlFor="appearance-ai-changes" className="block text-sm font-medium mb-2">Show AI changes</label>
        <select
          id="appearance-ai-changes"
          className="input"
          value={settings.aiChangesDisplay}
          onChange={(e) => onUpdate({ aiChangesDisplay: e.target.value as AiChangesDisplay })}
        >
          <option value="both">Both (inline + panel)</option>
          <option value="inline">Inline only (in the document)</option>
          <option value="panel">Panel only (Runs panel)</option>
        </select>
        <p className="text-xs text-subtle mt-1">Where AI-proposed edits and notes appear.</p>
      </div>
    </section>
  )
}
