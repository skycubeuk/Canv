import { AlertTriangle } from 'lucide-react'
import type { ConfigError } from './types'

interface Props {
  errors: ConfigError[]
  configDir?: string
  onReveal?: () => void
}

export function ErrorScreen({ errors, configDir, onReveal }: Props) {
  // Group by file, with file '' going under "General".
  const byFile = new Map<string, ConfigError[]>()
  for (const err of errors) {
    const key = err.file || ''
    if (!byFile.has(key)) byFile.set(key, [])
    byFile.get(key)!.push(err)
  }

  const fileGroups = Array.from(byFile.entries()).sort(([a], [b]) => {
    if (a === '') return 1
    if (b === '') return -1
    return a.localeCompare(b)
  })

  return (
    <div className="min-h-screen bg-app text-default p-8 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-start gap-3 mb-6">
          <AlertTriangle className="w-7 h-7 text-amber-600 flex-shrink-0 mt-1" />
          <div>
            <h1 className="text-xl font-semibold">Canv could not start</h1>
            <p className="text-sm text-muted mt-1">
              Fix the config files listed below and relaunch the app.
            </p>
          </div>
        </header>

        {fileGroups.map(([file, errs]) => (
          <section key={file || '__general__'} className="mb-6">
            <h2 className="font-mono text-sm text-default mb-2">
              {file || 'General'}
            </h2>
            <ul className="bg-elev rounded border border-default divide-y divide-[rgb(var(--border-default))]">
              {errs.map((e, i) => (
                <li key={i} className="px-4 py-2 text-sm">
                  {e.field && (
                    <code className="text-muted mr-2">{e.field}:</code>
                  )}
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {configDir && (
          <footer className="mt-8 text-xs text-muted">
            Config folder:{' '}
            <code className="text-default">{configDir}</code>
            {onReveal && (
              <button
                onClick={onReveal}
                className="ml-3 underline hover:text-default"
              >
                Open folder
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
