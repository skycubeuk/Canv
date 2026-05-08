import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RunControlsMenu } from './RunControlsMenu'

const baseProps = {
  open: true,
  onClose: vi.fn(),
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4-6',
  availableModels: ['claude-sonnet-4-6', 'claude-opus-4-7'],
  onChangeModel: vi.fn(),
  streamChunkDelayMs: 0 as 0 | 50 | 100 | 200,
  onChangeDelay: vi.fn(),
  followLatest: true,
  onToggleFollow: vi.fn(),
  meterTotalTokens: 1247,
  meterCostUsd: 0.012,
}

describe('RunControlsMenu', () => {
  it('does not render when closed', () => {
    render(<RunControlsMenu {...baseProps} open={false} />)
    expect(screen.queryByText(/model/i)).not.toBeInTheDocument()
  })

  it('renders model picker with available options', () => {
    render(<RunControlsMenu {...baseProps} />)
    const select = screen.getByLabelText(/model/i)
    expect(select).toHaveValue('claude-sonnet-4-6')
  })

  it('changing the model fires onChangeModel', () => {
    const onChangeModel = vi.fn()
    render(<RunControlsMenu {...baseProps} onChangeModel={onChangeModel} />)
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: 'claude-opus-4-7' } })
    expect(onChangeModel).toHaveBeenCalledWith('claude-opus-4-7')
  })

  it('renders the four slow-mode delay options', () => {
    render(<RunControlsMenu {...baseProps} />)
    expect(screen.getByRole('button', { name: '0ms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '50ms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '100ms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '200ms' })).toBeInTheDocument()
  })

  it('clicking a delay option fires onChangeDelay', () => {
    const onChangeDelay = vi.fn()
    render(<RunControlsMenu {...baseProps} onChangeDelay={onChangeDelay} />)
    fireEvent.click(screen.getByRole('button', { name: '100ms' }))
    expect(onChangeDelay).toHaveBeenCalledWith(100)
  })

  it('toggling auto-scroll fires onToggleFollow', () => {
    const onToggleFollow = vi.fn()
    render(<RunControlsMenu {...baseProps} onToggleFollow={onToggleFollow} />)
    fireEvent.click(screen.getByRole('switch', { name: /auto-scroll/i }))
    expect(onToggleFollow).toHaveBeenCalled()
  })

  it('renders token + cost meter', () => {
    render(<RunControlsMenu {...baseProps} />)
    expect(screen.getByText(/1,247/)).toBeInTheDocument()
    expect(screen.getByText(/\$0\.01/)).toBeInTheDocument()
  })
})
