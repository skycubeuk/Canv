import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatRetryActions } from './ChatRetryActions'

describe('ChatRetryActions', () => {
  it('renders Retry and Edit & retry for a cancelled message', () => {
    render(
      <ChatRetryActions
        kind="cancelled-or-error"
        disabled={false}
        onRetry={() => {}}
        onEditAndRetry={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /^retry$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit & retry/i })).toBeInTheDocument()
  })

  it('renders Retry whole turn (not just Retry) for a denied tool case', () => {
    render(
      <ChatRetryActions
        kind="denied-tool"
        disabled={false}
        onRetry={() => {}}
        onEditAndRetry={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /retry whole turn/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit & retry/i })).toBeInTheDocument()
  })

  it('renders only Retry from here for an earlier-message anchor', () => {
    render(
      <ChatRetryActions
        kind="earlier-anchor"
        disabled={false}
        onRetry={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /retry from here/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit & retry/i })).toBeNull()
  })

  it('disables all buttons and shows tooltip when disabled', () => {
    render(
      <ChatRetryActions
        kind="cancelled-or-error"
        disabled
        disabledReason="Stop the current run first"
        onRetry={() => {}}
        onEditAndRetry={() => {}}
      />,
    )
    const retry = screen.getByRole('button', { name: /^retry$/i })
    expect(retry).toBeDisabled()
    expect(retry).toHaveAttribute('title', 'Stop the current run first')
  })

  it('shows a countdown on Retry when retryAfterSeconds is set', () => {
    render(
      <ChatRetryActions
        kind="cancelled-or-error"
        disabled={false}
        retryAfterSeconds={5}
        onRetry={() => {}}
        onEditAndRetry={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /retry in 5s/i })).toBeInTheDocument()
  })

  it('fires onRetry when clicked', () => {
    const onRetry = vi.fn()
    render(
      <ChatRetryActions
        kind="cancelled-or-error"
        disabled={false}
        onRetry={onRetry}
        onEditAndRetry={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
