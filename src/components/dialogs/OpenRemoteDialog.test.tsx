import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import OpenRemoteDialog from './OpenRemoteDialog'

describe('OpenRemoteDialog', () => {
  it('renders the input and recent list', () => {
    render(<OpenRemoteDialog
      open
      onClose={() => {}}
      onConnect={async () => {}}
      recent={[{ raw: 'me@dev:/x', lastUsedMs: 1 }]}
    />)
    expect(screen.getByPlaceholderText(/user@host/i)).toBeInTheDocument()
    expect(screen.getByText('me@dev:/x')).toBeInTheDocument()
  })

  it('renders nothing when open is false', () => {
    const { container } = render(<OpenRemoteDialog
      open={false}
      onClose={() => {}}
      onConnect={async () => {}}
      recent={[]}
    />)
    expect(container.firstChild).toBeNull()
  })

  it('clicking a recent entry fills the input', () => {
    render(<OpenRemoteDialog
      open
      onClose={() => {}}
      onConnect={async () => {}}
      recent={[{ raw: 'a@b:/c', lastUsedMs: 1 }]}
    />)
    fireEvent.click(screen.getByText('a@b:/c'))
    expect((screen.getByPlaceholderText(/user@host/i) as HTMLInputElement).value).toBe('a@b:/c')
  })

  it('calls onConnect on submit and closes on success', async () => {
    const onConnect = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<OpenRemoteDialog open onClose={onClose} onConnect={onConnect} recent={[]} />)
    fireEvent.change(screen.getByPlaceholderText(/user@host/i), { target: { value: 'me@dev:/x' } })
    fireEvent.click(screen.getByRole('button', { name: /connect/i }))
    await waitFor(() => expect(onConnect).toHaveBeenCalledWith('me@dev:/x'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows the error message on failure and stays open', async () => {
    const onConnect = vi.fn().mockRejectedValue(new Error('auth failed'))
    const onClose = vi.fn()
    render(<OpenRemoteDialog open onClose={onClose} onConnect={onConnect} recent={[]} />)
    fireEvent.change(screen.getByPlaceholderText(/user@host/i), { target: { value: 'me@dev:/x' } })
    fireEvent.click(screen.getByRole('button', { name: /connect/i }))
    await waitFor(() => expect(screen.getByText(/auth failed/i)).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Connect is disabled when input is empty', () => {
    render(<OpenRemoteDialog open onClose={() => {}} onConnect={async () => {}} recent={[]} />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeDisabled()
  })

  it('submits on Enter key', async () => {
    const onConnect = vi.fn().mockResolvedValue(undefined)
    render(<OpenRemoteDialog open onClose={() => {}} onConnect={onConnect} recent={[]} />)
    const input = screen.getByPlaceholderText(/user@host/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'a@b:/c' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onConnect).toHaveBeenCalledWith('a@b:/c'))
  })
})
