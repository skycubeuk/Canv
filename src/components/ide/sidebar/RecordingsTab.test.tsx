import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecordingsTab } from './RecordingsTab'
import type { RecordingRecord } from '../../../lib/tts'

const rec: RecordingRecord = {
  id: 'rec_1', label: 'Intro paragraph', file: 'rec_1.mp3', createdAt: Date.now(),
  source: { path: 'a.md', kind: 'selection' }, voiceId: 'v', voiceName: 'Rachel',
  modelId: 'eleven_multilingual_v2', characters: 10, durationMs: 41000, origin: 'user',
}

function svc(over = {}) {
  return { list: [rec], playingId: null, position: 0, duration: 0, rate: 1, play: vi.fn(), pause: vi.fn(), seek: vi.fn(), setRate: vi.fn(), remove: vi.fn(), readAloud: vi.fn(), refresh: vi.fn(), ...over }
}

describe('RecordingsTab', () => {
  it('shows the empty state when there are no recordings', () => {
    render(<RecordingsTab recordings={svc({ list: [] }) as never} onReadDocument={vi.fn()} />)
    expect(screen.getByText(/No recordings yet/i)).toBeTruthy()
  })

  it('renders a row and plays it on click', () => {
    const play = vi.fn()
    render(<RecordingsTab recordings={svc({ play }) as never} onReadDocument={vi.fn()} />)
    expect(screen.getByText('Intro paragraph')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Play Intro paragraph'))
    expect(play).toHaveBeenCalledWith('rec_1')
  })

  it('fires onReadDocument from the header button', () => {
    const onReadDocument = vi.fn()
    render(<RecordingsTab recordings={svc() as never} onReadDocument={onReadDocument} />)
    fireEvent.click(screen.getByText(/Read this document/i))
    expect(onReadDocument).toHaveBeenCalled()
  })
})
