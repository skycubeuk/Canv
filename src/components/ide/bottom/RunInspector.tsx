import { useState } from 'react'
import type { RunRecord } from '../../ResultsPanel'
import { providerName } from '../../../adapters'

interface Props {
  run: RunRecord
}

export function RunInspector({ run }: Props) {
  return (
    <div className="flex-1 overflow-auto px-4 py-3 space-y-3 font-mono">
      <Meta run={run} />
      {run.system && <Section title="System">{run.system}</Section>}
      {run.basePrompt && <Section title="Base prompt (used for refines)">{run.basePrompt}</Section>}
      {run.rawMessages && run.rawMessages.length > 0 && (
        <Section title={`Raw messages (${run.rawMessages.length})`}>
          {run.rawMessages.map((m, i) => (
            <div key={i} className="mb-2">
              <div className="text-[10px] uppercase tracking-wide text-muted">{m.role}</div>
              <pre className="whitespace-pre-wrap wrap-break-word">{'content' in m ? m.content : ''}</pre>
            </div>
          ))}
        </Section>
      )}
      <Section title="Response">{run.response || <em className="text-subtle">(empty)</em>}</Section>
      {run.error && (
        <Section title="Error">
          <span className="text-red-400">{run.error}</span>
        </Section>
      )}
    </div>
  )
}

function Meta({ run }: { run: RunRecord }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px] text-muted">
      <Cell label="Status" value={run.status} />
      <Cell label="Provider" value={providerName(run.provider)} />
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
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="font-medium text-default">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{title}</h3>
      <div className="pl-2 border-l border-default text-default whitespace-pre-wrap wrap-break-word">
        {children}
      </div>
    </section>
  )
}

export function CopyButton({ label, text }: { label: string; text: () => string }) {
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
      className="px-2 py-0.5 rounded-sm border border-default text-muted hover:bg-hover"
      title={label}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

