import { useMemo, useState } from 'react'
import type { RunRecord } from '../../ResultsPanel'
import { timeAgo } from '../../../lib/timeAgo'
import type { ChatSession } from '../../../hooks/useChatSessions'
import type { SidebarSession } from '../../ChatSessionsSidebar'
import { RunInspector, CopyButton } from './RunInspector'
import { ChatInspector } from './ChatInspector'

type Source = 'runs' | 'chats'

interface Props {
  runs: RunRecord[]
  /** Optional chat-side props. When all are provided, the Runs|Chats toggle
   *  is shown. When omitted (e.g. the dock popout window), the tab behaves
   *  exactly like before — runs only. */
  sessions?: SidebarSession[]
  activeSessionId?: string
  getSession?: (id: string) => ChatSession | null
  chatSystemPreamble?: string
}

export function OutputTab({ runs, sessions, activeSessionId, getSession, chatSystemPreamble }: Props) {
  const chatAvailable = !!sessions && !!getSession && chatSystemPreamble !== undefined

  const initialSource: Source = runs.length > 0 ? 'runs' : chatAvailable ? 'chats' : 'runs'
  const [source, setSource] = useState<Source>(initialSource)

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const activeRun = useMemo(() => {
    if (selectedRunId) return runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null
    return runs[0] ?? null
  }, [runs, selectedRunId])

  const activeSession = useMemo<ChatSession | null>(() => {
    if (!chatAvailable || !sessions || !getSession) return null
    const id = selectedSessionId ?? activeSessionId ?? sessions[0]?.id ?? null
    return id ? getSession(id) : null
  }, [chatAvailable, sessions, getSession, selectedSessionId, activeSessionId])

  if (source === 'runs' && runs.length === 0 && !chatAvailable) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted px-6 text-center bg-panel">
        Run an agent from the floating toolbar or document toolbar to inspect its raw I/O here.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-app text-xs overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-default bg-panel">
        {chatAvailable && (
          <select
            aria-label="Output source"
            className="input w-auto text-xs"
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
          >
            <option value="runs">Runs</option>
            <option value="chats">Chats</option>
          </select>
        )}

        {source === 'runs' ? (
          runs.length > 0 ? (
            <select
              className="input w-auto text-xs"
              value={activeRun?.id ?? ''}
              onChange={(e) => setSelectedRunId(e.target.value)}
              aria-label="Select run"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.agentLabel} — {timeAgo(r.timestamp)}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted">No runs yet.</span>
          )
        ) : sessions && sessions.length > 0 ? (
          <select
            className="input w-auto text-xs"
            value={activeSession?.id ?? ''}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            aria-label="Select chat session"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted">No chat sessions yet.</span>
        )}

        <div className="flex-1" />

        {source === 'runs' && activeRun
          ? runCopyButtons(activeRun).map((b) => <CopyButton key={b.label} label={b.label} text={b.text} />)
          : null}

        {source === 'chats' && activeSession ? (
          <>
            <CopyButton
              label="Copy session (JSON)"
              text={() => JSON.stringify(activeSession, null, 2)}
            />
            <CopyButton
              label="Copy transcript"
              text={() => transcriptOf(activeSession, chatSystemPreamble ?? '')}
            />
          </>
        ) : null}
      </div>

      {/* Body */}
      {source === 'runs' && activeRun ? (
        <RunInspector run={activeRun} />
      ) : source === 'chats' && activeSession ? (
        <div className="flex-1 overflow-auto px-4 py-3">
          <ChatInspector session={activeSession} systemText={chatSystemPreamble ?? ''} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted text-sm px-6 text-center">
          {source === 'runs'
            ? 'Run an agent from the floating toolbar or document toolbar to inspect its raw I/O here.'
            : 'No chat sessions yet. Start one in the Chat panel.'}
        </div>
      )}
    </div>
  )
}

function runCopyButtons(run: RunRecord): { label: string; text: () => string }[] {
  return [
    { label: 'Copy prompt', text: () => promptOf(run) },
    { label: 'Copy response', text: () => run.response },
    { label: 'Copy all (JSON)', text: () => JSON.stringify(run, null, 2) },
  ]
}

function promptOf(run: RunRecord): string {
  if (run.rawMessages && run.rawMessages.length) {
    const sysLine = run.system ? `[system]\n${run.system}\n\n` : ''
    return sysLine + run.rawMessages.map((m) => `[${m.role}]\n${'content' in m ? m.content : ''}`).join('\n\n')
  }
  return run.basePrompt ?? ''
}

function transcriptOf(session: ChatSession, systemText: string): string {
  const parts: string[] = []
  if (systemText) parts.push(`[system]\n${systemText}`)
  for (const m of session.messages) {
    parts.push(`[${m.role}]\n${m.content}`)
    if (m.role === 'assistant') {
      for (const c of m.toolCalls ?? []) {
        parts.push(`[tool_call ${c.name}]\n${JSON.stringify(c.input, null, 2)}`)
      }
      for (const r of m.toolResults ?? []) {
        const tag = r.isUserDenial ? 'tool_result_denied' : r.isError ? 'tool_result_error' : 'tool_result'
        parts.push(`[${tag} ${r.id}]\n${r.content}`)
      }
    }
  }
  return parts.join('\n\n')
}
