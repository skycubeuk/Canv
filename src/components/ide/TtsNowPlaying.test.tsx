import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TtsNowPlaying } from './TtsNowPlaying'

describe('TtsNowPlaying', () => {
  it('renders nothing when nothing is playing', () => {
    const { container } = render(<TtsNowPlaying playingLabel={null} onPause={vi.fn()} onOpen={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
  it('shows the label and pauses on click', () => {
    const onPause = vi.fn()
    render(<TtsNowPlaying playingLabel="draft.md" onPause={onPause} onOpen={vi.fn()} />)
    expect(screen.getByText('draft.md')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Pause'))
    expect(onPause).toHaveBeenCalled()
  })
})
