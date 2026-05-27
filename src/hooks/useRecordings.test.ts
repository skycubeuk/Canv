import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRecordings } from './useRecordings'
import type { RecordingRecord } from '../lib/tts'

const rec: RecordingRecord = {
  id: 'rec_1', label: 'Hi', file: 'rec_1.mp3', createdAt: 1,
  source: { path: 'a.md', kind: 'selection' }, voiceId: 'v', voiceName: 'Rachel',
  modelId: 'eleven_multilingual_v2', characters: 2, durationMs: null, origin: 'user',
}

beforeEach(() => {
  // jsdom doesn't implement media playback; stub so new Audio()/.play()/.load() don't throw.
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  window.HTMLMediaElement.prototype.load = vi.fn()
  ;(window as unknown as { canvTTS?: unknown }).canvTTS = {
    generate: vi.fn(async () => rec),
    list: vi.fn(async () => [rec]),
    delete: vi.fn(async () => {}),
    setDuration: vi.fn(async () => {}),
    voices: vi.fn(async () => []),
    models: vi.fn(async () => []),
  }
})

function cfg(over = {}) {
  return {
    getProvider: () => 'elevenlabs' as const,
    getApiKey: () => 'k',
    getDefaultVoice: () => ({ voiceId: 'v', voiceName: 'Rachel' }),
    getDefaultModel: () => 'eleven_multilingual_v2',
    getWorkspaceFileUrl: (file: string) => `canv-rec://recordings/${file}`,
    showToast: vi.fn(),
    confirm: vi.fn(async () => true),
    ...over,
  }
}

describe('useRecordings', () => {
  it('loads the list on mount', async () => {
    const { result } = renderHook(() => useRecordings(cfg()))
    await waitFor(() => expect(result.current.list).toHaveLength(1))
  })

  it('readAloud generates, prepends, and marks the new recording playing', async () => {
    const { result } = renderHook(() => useRecordings(cfg()))
    await act(async () => { await result.current.readAloud({ text: 'Hi.', sourcePath: 'a.md', sourceKind: 'selection', label: 'Hi.' }) })
    expect(window.canvTTS!.generate).toHaveBeenCalled()
    expect(result.current.playingId).toBe('rec_1')
  })

  it('readAloud guards when no api key', async () => {
    const showToast = vi.fn()
    const { result } = renderHook(() => useRecordings(cfg({ getApiKey: () => '', showToast })))
    await act(async () => { await result.current.readAloud({ text: 'Hi.', sourcePath: null, sourceKind: 'document', label: 'doc' }) })
    expect(window.canvTTS!.generate).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalled()
  })
})
