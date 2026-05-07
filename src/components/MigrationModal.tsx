import { useState } from 'react'
import { Check } from 'lucide-react'
import { exportBackup } from '../lib/backup'
import { htmlToMarkdown } from '../lib/markdown'
import { getFs, isElectron } from '../lib/fs'

interface Props {
  onComplete: (root: string) => void
}

const LEGACY_KEYS = [
  'canv:document',
  'canv:title',
  'canv:profile',
  'canv:contextFiles',
  'canv:runs',
  'canv:chat',
  'canv:chatOpen',
]

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}

function welcomeBody(): string {
  return [
    '# Welcome to Canv',
    '',
    'This folder is your workspace. Files you create here become your writing project.',
    '',
    '- Click a file in the left sidebar to open it.',
    '- Right-click a file in the tree to pin it as a **summary** or as **full text**. Pinned files (other than the one you are editing) are sent with every agent run.',
    '- Auto-save writes changes back to disk while you write.',
    '',
  ].join('\n')
}

export function MigrationModal({ onComplete }: Props) {
  const [exported, setExported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const electron = isElectron()

  const handleExport = () => {
    try {
      exportBackup()
      setExported(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleChoose = async () => {
    if (!electron) return
    setBusy(true)
    setError(null)
    try {
      const picked = await getFs().pickWorkspace()
      if (!picked) {
        setBusy(false)
        return
      }
      const root = picked.root

      // Convert legacy doc to markdown (if any) and write it as a real file.
      const oldHtml = localStorage.getItem('canv:document') ?? ''
      const oldTitle = localStorage.getItem('canv:title') ?? 'Untitled'
      const docMd = oldHtml.trim() ? htmlToMarkdown(oldHtml) : ''
      const slug = slugify(oldTitle)
      const docName = docMd ? `${slug}.md` : null

      // Write Welcome.md (always) and migrated doc (if there was content).
      try {
        await getFs().createFile('Welcome.md', welcomeBody())
      } catch {
        // file already exists — ignore
      }
      if (docName && docMd) {
        try {
          await getFs().createFile(docName, docMd)
        } catch {
          // existing file — try a numbered fallback
          for (let i = 2; i < 50; i++) {
            try {
              await getFs().createFile(`${slug}-${i}.md`, docMd)
              break
            } catch {
              // continue
            }
          }
        }
      }

      // Wipe legacy keys only after successful writes.
      try {
        for (const k of LEGACY_KEYS) localStorage.removeItem(k)
        localStorage.setItem('canv:schemaVersion', '2')
        localStorage.setItem('canv:lastWorkspace', root)
      } catch {
        // ignore
      }
      onComplete(root)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-w-lg w-full bg-elev rounded-lg shadow-xl p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Welcome to Canv 0.2</h2>
          <p className="text-sm text-muted">
            Canv now stores your writing on your computer. Pick a folder to use as your workspace.
            Your existing document and uploaded context files will be replaced — export a backup first.
          </p>
        </div>
        {!electron && (
          <div className="rounded-md bg-amber-950/40 text-amber-200 px-3 py-2 text-sm">
            File workspaces need the desktop app. Use the button below to export your existing data so
            you can restore it later.
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-950/40 text-red-200 px-3 py-2 text-sm">
            {error}
          </div>
        )}
        <ol className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${exported ? 'bg-emerald-500 text-white' : 'bg-active'}`}>1</span>
            <div className="flex-1">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleExport}
                disabled={busy}
              >
                {exported ? (
                  <span className="inline-flex items-center gap-1">
                    Backup downloaded <Check aria-hidden className="w-3 h-3" /> (download again)
                  </span>
                ) : 'Export backup (.json)'}
              </button>
              <p className="text-xs text-muted mt-1">
                Saves all current Canv data as a JSON file you can keep.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs ${exported ? 'bg-active' : 'bg-panel text-subtle'}`}>2</span>
            <div className="flex-1">
              <button
                type="button"
                className="btn-primary"
                disabled={!exported || busy || !electron}
                onClick={handleChoose}
              >
                {busy ? 'Setting up workspace…' : 'Choose workspace folder'}
              </button>
              <p className="text-xs text-muted mt-1">
                Canv will create a Welcome.md and (if your document had content) a copy of your existing doc.
                Then it clears the old single-document storage.
              </p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  )
}
