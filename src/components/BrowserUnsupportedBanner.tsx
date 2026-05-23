import { MigrationModal } from './MigrationModal'
import { legacyStateExists } from '../lib/legacyState'

interface Props {
  migrationOpen: boolean
  setMigrationOpen: (open: boolean) => void
}

/**
 * Fallback UI for browser-only builds (no Electron / file APIs available).
 * Canv 0.2's workspace UX requires disk access; this banner explains and,
 * if a legacy localStorage workspace is detected, offers an export path.
 */
export function BrowserUnsupportedBanner({ migrationOpen, setMigrationOpen }: Props) {
  return (
    <div
      data-testid="browser-unsupported-banner"
      role="alert"
      aria-label="Canv 0.2 needs the desktop app"
      className="h-full flex flex-col items-center justify-center text-center px-6 bg-app text-default"
    >
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold">Canv 0.2 needs the desktop app</h1>
        <p className="text-sm opacity-80">
          This version stores your writing on disk, which the browser preview can't do.
          Download the desktop build (macOS / Windows / Linux) to use file workspaces.
        </p>
        {legacyStateExists() && (
          <button type="button" className="btn-primary" onClick={() => setMigrationOpen(true)}>
            Export legacy backup
          </button>
        )}
      </div>
      {migrationOpen && (
        <MigrationModal onComplete={() => { setMigrationOpen(false); window.location.reload() }} />
      )}
    </div>
  )
}
