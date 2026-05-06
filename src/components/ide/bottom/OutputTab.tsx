import { useMemo, useState } from 'react'
import type { RunRecord } from '../../ResultsPanel'
import { timeAgo } from '../../../lib/timeAgo'

interface Props {
  runs: RunRecord[]
}

export function OutputTab({ runs }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const active = useMemo(() => {
    if (selectedId) return runs.find((r) => r.id === selectedId) ?? runs[0] ?? null
    return runs[0] ?? null
  }, [runs, selectedId])

  if (runs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-stone-500 dark:text-neutral-400 px-6 text-center bg-stone-100 dark:bg-neutral-900">
        Run an agent from the floating toolbar or document toolbar to inspect its raw I/O here.
      </div>
    )
  }
  if (!active) return null

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-neutral-950 text-xs overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-stone-200 dark:border-neutral-800 bg-stone-100 dark:bg-neutral-900">
        <select
          className="input text-xs"
          value={active.id}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Select run"
        >
          {runs.map((r) => (
            // <option> cannot contain JSX children — icon omitted here
            <option key={r.id} value={r.id}>
              {r.agentLabel} — {timeAgo(r.timestamp)}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <CopyButton label="Copy prompt" text={() => promptOf(active)} />
        <CopyButton label="Copy response" text={() => active.response} />
        <CopyButton label="Copy all (JSON)" text={() => JSON.stringify(active, null, 2)} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-3 font-mono">
        <Meta run={active} />
        {active.system && <Section title="System">{active.system}</Section>}
        {active.basePrompt && <Section title="Base prompt (used for refines)">{active.basePrompt}</Section>}
        {active.rawMessages && active.rawMessages.length > 0 && (
          <Section title={`Raw messages (${active.rawMessages.length})`}>
            {active.rawMessages.map((m, i) => (
              <div key={i} className="mb-2">
                <div className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-neutral-500">
                  {m.role}
                </div>
                <pre className="whitespace-pre-wrap break-words">{'content' in m ? m.content : ''}</pre>
              </div>
            ))}
          </Section>
        )}
        <Section title="Response">{active.response || <em className="text-stone-400">(empty)</em>}</Section>
        {active.error && (
          <Section title="Error">
            <span className="text-red-600 dark:text-red-400">{active.error}</span>
          </Section>
        )}
      </div>
    </div>
  )
}

function Meta({ run }: { run: RunRecord }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px] text-stone-600 dark:text-neutral-400">
      <Cell label="Status" value={run.status} />
      <Cell label="Provider" value={run.provider} />
      <Cell label="Model" value={run.model} />
      <Cell label="Elapsed" value={run.elapsedMs != null ? `${run.elapsedMs} ms` : '—'} />
      <Cell label="Input tokens" value={run.tokenUsage ? String(run.tokenUsage.input) : '—'} />
      <Cell label="Output tokens" value={run.tokenUsage ? String(run.tokenUsage.output) : '—'} />
      <Cell label="Truncated" value={run.truncated ? 'yes' : 'no'} />
      <Cell label="Followups" value={String(run.followups?.length ?? 0)} />
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-neutral-500">{label}</span>
      <span className="font-medium text-stone-700 dark:text-neutral-200">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-neutral-500 mb-1">{title}</h3>
      <div className="pl-2 border-l border-stone-200 dark:border-neutral-800 text-stone-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
        {children}
      </div>
    </section>
  )
}

function CopyButton({ label, text }: { label: string; text: () => string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text())
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          // clipboard unavailable
        }
      }}
      className="px-2 py-0.5 rounded border border-stone-300 dark:border-neutral-700 text-stone-600 dark:text-neutral-400 hover:bg-stone-200 dark:hover:bg-neutral-800"
      title={label}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

function promptOf(run: RunRecord): string {
  if (run.rawMessages && run.rawMessages.length) {
    const sysLine = run.system ? `[system]\n${run.system}\n\n` : ''
    return sysLine + run.rawMessages.map((m) => `[${m.role}]\n${'content' in m ? m.content : ''}`).join('\n\n')
  }
  return run.basePrompt ?? ''
}
