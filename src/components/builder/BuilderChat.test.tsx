import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BuilderChat } from './BuilderChat'

beforeEach(() => cleanup())

describe('BuilderChat', () => {
  it('renders empty-state hint when history is empty', () => {
    render(<BuilderChat history={[]} pending={false} onSend={() => {}} />)
    expect(screen.getByText(/describe what you want/i)).toBeTruthy()
  })
  it('renders user message verbatim and assistant message collapsed by default', () => {
    render(<BuilderChat history={[
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ]} pending={false} onSend={() => {}} />)
    // User content shown verbatim.
    expect(screen.getByText('hello')).toBeTruthy()
    // Assistant content collapsed — only a summary is visible, raw 'world' is hidden.
    expect(screen.queryByText('world')).toBeNull()
    expect(screen.getByRole('button', { name: /show output/i })).toBeTruthy()
  })

  it('expanding an assistant message reveals the raw content', () => {
    render(<BuilderChat history={[
      { role: 'assistant', content: 'world' },
    ]} pending={false} onSend={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /show output/i }))
    expect(screen.getByText('world')).toBeTruthy()
    expect(screen.getByRole('button', { name: /hide output/i })).toBeTruthy()
  })

  it('shows "Generated <name> v<version>" summary when assistant output parses as a manifest payload', () => {
    const payload = JSON.stringify({
      manifest: { id: 'x', name: 'Word Count', version: '1.2.3', capabilities: [], contributions: [] },
      files: { 'panels/main.html': '<p>x</p>', 'panels/main.js': 'console.log(1)' },
    })
    render(<BuilderChat history={[
      { role: 'assistant', content: payload },
    ]} pending={false} onSend={() => {}} />)
    expect(screen.getByText(/Generated "Word Count" v1\.2\.3 \(2 files\)/)).toBeTruthy()
  })
  it('shows "generating…" when pending', () => {
    render(<BuilderChat history={[]} pending={true} onSend={() => {}} />)
    expect(screen.getByText(/generating/i)).toBeTruthy()
  })
  it('Send button disabled when input empty', () => {
    render(<BuilderChat history={[]} pending={false} onSend={() => {}} />)
    expect((screen.getByRole('button', { name: /send/i }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('Cmd+Enter calls onSend with trimmed text', () => {
    const onSend = vi.fn()
    render(<BuilderChat history={[]} pending={false} onSend={onSend} />)
    const ta = screen.getByLabelText('message') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '  build me X  ' } })
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true })
    expect(onSend).toHaveBeenCalledWith('build me X')
  })
  it('clicking Send calls onSend and clears input', () => {
    const onSend = vi.fn()
    render(<BuilderChat history={[]} pending={false} onSend={onSend} />)
    const ta = screen.getByLabelText('message') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('hello')
    expect(ta.value).toBe('')
  })
  it('textarea disabled while pending', () => {
    render(<BuilderChat history={[]} pending={true} onSend={() => {}} />)
    expect((screen.getByLabelText('message') as HTMLTextAreaElement).disabled).toBe(true)
  })
  it('renders a skills-kind message as a collapsed muted line', () => {
    render(<BuilderChat history={[
      { role: 'assistant', content: JSON.stringify({ skillsCalled: ['learn_panel', 'learn_command'] }), kind: 'skills' },
    ]} pending={false} onSend={() => {}} />)
    expect(screen.getByText(/learn_panel/)).toBeTruthy()
    expect(screen.getByText(/learn_command/)).toBeTruthy()
  })
})
