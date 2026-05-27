import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getTts, isTtsAvailable, type RecordingRecord } from '../lib/tts'
import { cleanForSpeech } from '../lib/tts/cleanForSpeech'

export interface RecordingsConfig {
  getProvider: () => import('../lib/tts').TtsProvider
  getApiKey: () => string
  getDefaultVoice: () => { voiceId: string; voiceName: string }
  getDefaultModel: () => string
  getWorkspaceFileUrl: (file: string) => string
  showToast: (msg: string) => void
  confirm: (opts: { title: string; message: string }) => Promise<boolean>
}

export interface ReadAloudArgs {
  text: string
  sourcePath: string | null
  sourceKind: 'selection' | 'document'
  label: string
  voiceId?: string
  voiceName?: string
}

const COST_CONFIRM_CHARS = 10000

export function useRecordings(cfg: RecordingsConfig) {
  const [list, setList] = useState<RecordingRecord[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRateState] = useState(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // One shared <audio> for the whole app session — survives sidebar tab switches.
  // eslint-disable-next-line react-hooks/refs -- lazy single init guarded by null check (plus jsdom Audio guard); never read during render
  if (audioRef.current == null && typeof Audio !== 'undefined') audioRef.current = new Audio()

  // Keep the latest config reachable from long-lived audio event listeners
  // without re-subscribing them every render. Updated in an effect (not during
  // render) so the audio 'error'/'play' handlers always read the current cfg.
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg })

  const refresh = useCallback(async () => {
    if (!isTtsAvailable()) return
    try { setList(await getTts().list()) } catch { /* no workspace */ }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async list load; setState defers to a microtask, no cascade
  useEffect(() => { void refresh() }, [refresh])

  // Wire audio element events once.
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setPosition(a.currentTime)
    const onMeta = () => {
      setDuration(a.duration)
      if (playingId && Number.isFinite(a.duration)) void getTts().setDuration(playingId, Math.round(a.duration * 1000)).catch(() => {})
    }
    const onEnd = () => setPlayingId(null)
    // Surface load/decode failures instead of swallowing them — a CSP block or a
    // missing file fires this with a media error code. Silent failure here was
    // the original "no audio, no error" bug.
    const onError = () => {
      setPlayingId(null)
      const code = a.error?.code
      cfgRef.current.showToast(`Couldn't play the recording${code ? ` (media error ${code})` : ''}.`)
    }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnd)
    a.addEventListener('error', onError)
    return () => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('ended', onEnd); a.removeEventListener('error', onError) }
  }, [playingId])

  const play = useCallback((id: string) => {
    const a = audioRef.current
    const row = list.find((r) => r.id === id)
    if (!a || !row) return
    const url = cfg.getWorkspaceFileUrl(row.file)
    // Switching tracks: reset transport state so the footer scrubber never has
    // value > max while the new track's metadata/timeupdate events are pending.
    if (a.src !== url) { a.src = url; a.load(); setPosition(0); setDuration(0) }
    a.playbackRate = rate
    void a.play().catch((e: unknown) => {
      // Autoplay policy blocked it — tell the user. Load/decode failures fire the
      // 'error' event instead; AbortError (interrupted by a new load) is benign.
      if (e instanceof DOMException && e.name === 'NotAllowedError') cfgRef.current.showToast('Autoplay was blocked — press play on the recording.')
    })
    setPlayingId(id)
  }, [list, rate, cfg])

  const pause = useCallback(() => { audioRef.current?.pause(); setPlayingId(null) }, [])
  const seek = useCallback((t: number) => { if (audioRef.current) audioRef.current.currentTime = t; setPosition(t) }, [])
  const setRate = useCallback((r: number) => { setRateState(r); if (audioRef.current) audioRef.current.playbackRate = r }, [])

  const readAloud = useCallback(async (args: ReadAloudArgs) => {
    if (!isTtsAvailable()) return
    const apiKey = cfg.getApiKey()
    const def = cfg.getDefaultVoice()
    const voiceId = args.voiceId ?? def.voiceId
    const voiceName = args.voiceName ?? def.voiceName
    if (!apiKey || !voiceId) { cfg.showToast('Add your ElevenLabs key and pick a voice in Settings.'); return }
    // Clean Markdown→prose once; the cost check and the request both use the cleaned text.
    const spoken = cleanForSpeech(args.text)
    if (!spoken.trim()) { cfg.showToast('Nothing to read.'); return }
    if (args.sourceKind === 'document' && spoken.length > COST_CONFIRM_CHARS) {
      const ok = await cfg.confirm({ title: 'Read document aloud', message: `This will send ≈${spoken.length.toLocaleString()} characters to ElevenLabs. Continue?` })
      if (!ok) return
    }
    try {
      const rec = await getTts().generate({
        provider: cfg.getProvider(), text: spoken, voiceId, voiceName, modelId: cfg.getDefaultModel(),
        apiKey, sourcePath: args.sourcePath, sourceKind: args.sourceKind, label: args.label,
      })
      setList((prev) => [rec, ...prev.filter((r) => r.id !== rec.id)])
      setPlayingId(rec.id)
      const a = audioRef.current
      // New track: reset transport state before the new src's events arrive.
      setPosition(0); setDuration(0)
      if (a) {
        a.src = cfg.getWorkspaceFileUrl(rec.file); a.playbackRate = rate
        void a.play().catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'NotAllowedError') cfg.showToast('Autoplay was blocked — press play on the recording.')
        })
      }
    } catch (err) {
      cfg.showToast(err instanceof Error ? err.message : 'Read-aloud failed.')
    }
  }, [cfg, rate])

  const remove = useCallback(async (id: string) => {
    if (!isTtsAvailable()) return
    if (playingId === id) pause()
    await getTts().delete(id)
    setList((prev) => prev.filter((r) => r.id !== id))
  }, [playingId, pause])

  return useMemo(() => ({ list, playingId, position, duration, rate, refresh, readAloud, remove, play, pause, seek, setRate }),
    [list, playingId, position, duration, rate, refresh, readAloud, remove, play, pause, seek, setRate])
}
