export interface RecordingRecord {
  id: string
  label: string
  file: string
  createdAt: number
  source: { path: string | null; kind: 'selection' | 'document' }
  voiceId: string
  voiceName: string
  modelId: string
  characters: number
  durationMs: number | null
  origin: string
}

export type TtsProvider = 'elevenlabs'   // grows as adapters are added

export interface GenerateParams {
  provider: TtsProvider
  text: string
  voiceId: string
  voiceName: string
  modelId: string
  apiKey: string
  sourcePath: string | null
  sourceKind: 'selection' | 'document'
  label: string
}

export interface VoiceOption { voiceId: string; name: string }
export interface ModelOption { modelId: string; name: string }

export interface CanvTts {
  generate: (params: GenerateParams) => Promise<RecordingRecord>
  list: () => Promise<RecordingRecord[]>
  delete: (id: string) => Promise<void>
  setDuration: (id: string, ms: number) => Promise<void>
  voices: (provider: TtsProvider, apiKey: string) => Promise<VoiceOption[]>
  models: (provider: TtsProvider, apiKey: string) => Promise<ModelOption[]>
}

declare global {
  interface Window { canvTTS?: CanvTts }
}

export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.canvTTS
}

export function getTts(): CanvTts {
  if (typeof window === 'undefined' || !window.canvTTS) throw new Error('TTS bridge unavailable (desktop only)')
  return window.canvTTS
}
