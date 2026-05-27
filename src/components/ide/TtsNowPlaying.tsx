import { Volume2, Pause } from 'lucide-react'

interface Props {
  playingLabel: string | null
  onPause: () => void
  onOpen: () => void
}

export function TtsNowPlaying({ playingLabel, onPause, onOpen }: Props) {
  if (!playingLabel) return null
  return (
    <div className="flex items-center gap-1 px-2">
      <button type="button" aria-label="Pause" onClick={onPause} className="w-5 h-5 grid place-items-center rounded-sm text-muted hover:bg-hover hover:text-default">
        <Pause className="w-3.5 h-3.5" />
      </button>
      <button type="button" className="flex items-center gap-1 text-xs text-muted hover:text-default" onClick={onOpen}>
        <Volume2 className="w-3.5 h-3.5" aria-hidden />
        <span className="truncate max-w-[160px]">{playingLabel}</span>
      </button>
    </div>
  )
}
