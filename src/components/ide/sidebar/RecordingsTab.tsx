import { Play, Pause, Trash2 } from 'lucide-react'
import type { useRecordings } from '../../../hooks/useRecordings'
import { timeAgo } from '../../../lib/timeAgo'

function fmt(ms: number | null): string {
  if (!ms || !Number.isFinite(ms)) return '--:--'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface Props {
  recordings: ReturnType<typeof useRecordings>
}

export function RecordingsTab({ recordings }: Props) {
  const { list, playingId, position, duration, rate, play, pause, seek, setRate, remove } = recordings
  return (
    <div className="flex flex-col h-full min-h-0">
      {list.length === 0 ? (
        <div className="p-4 text-sm text-muted">No recordings yet — highlight text and hit the speaker, or read the whole document.</div>
      ) : (
        <>
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
          <div className="shrink-0 border-t border-default px-3 py-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={playingId ? 'Pause' : 'Play'}
                onClick={() => { if (playingId) { pause() } else if (list[0]) { play(list[0].id) } }}
                className="btn-icon"
              >
                {playingId ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={position}
                step="0.1"
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 h-1 accent-current"
                aria-label="Seek"
              />
              <span className="text-xs text-muted tabular-nums shrink-0">
                {fmt(position * 1000)} / {fmt(duration * 1000)}
              </span>
            </div>
            <div className="flex items-center justify-end gap-1">
              <span className="text-xs text-muted">Speed</span>
              <select
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="text-xs bg-transparent border border-default rounded px-1 py-0.5"
                aria-label="Playback speed"
              >
                {([0.75, 1, 1.25, 1.5, 2] as const).map((r) => (
                  <option key={r} value={r}>{r === 1 ? '1×' : `${r}×`}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
