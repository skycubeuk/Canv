import { Volume2, Play, Pause, Trash2 } from 'lucide-react'
import type { useRecordings } from '../../../hooks/useRecordings'
import { timeAgo } from '../../../lib/timeAgo'

function fmt(ms: number | null): string {
  if (!ms || !Number.isFinite(ms)) return '--:--'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Props {
  recordings: ReturnType<typeof useRecordings>
  onReadDocument: () => void
}

export function RecordingsTab({ recordings, onReadDocument }: Props) {
  const { list, playingId, play, pause, remove } = recordings
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-default">
        <button type="button" className="btn-secondary btn-sm flex items-center gap-1" onClick={onReadDocument}>
          <Volume2 className="w-4 h-4" aria-hidden /> Read this document
        </button>
      </div>
      {list.length === 0 ? (
        <div className="p-4 text-sm text-muted">No recordings yet — highlight text and hit the speaker, or read the whole document.</div>
      ) : (
        <ul className="flex-1 overflow-auto min-h-0">
          {list.map((r) => {
            const isPlaying = playingId === r.id
            return (
              <li key={r.id} className={`flex items-start gap-2 px-3 py-2 ${isPlaying ? 'bg-active' : 'hover:bg-hover'}`}>
                <button type="button" aria-label={`${isPlaying ? 'Pause' : 'Play'} ${r.label}`}
                  onClick={() => (isPlaying ? pause() : play(r.id))} className="btn-icon mt-0.5">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <span className="text-sm truncate">{r.label}</span>
                    <span className="text-xs text-muted shrink-0">{fmt(r.durationMs)}</span>
                  </div>
                  <div className="text-xs text-muted truncate">{r.voiceName} · {r.source.kind} · {timeAgo(r.createdAt)}</div>
                </div>
                <button type="button" aria-label={`Delete ${r.label}`} onClick={() => void remove(r.id)} className="btn-icon mt-0.5">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
