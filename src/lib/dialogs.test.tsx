import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { DialogProvider, useDialogs } from './dialogs'

function PromptHarness({
  initialValue = 'hello.md',
  validate,
  onResult,
}: {
  initialValue?: string
  validate?: (value: string) => string | null
  onResult: (v: string | null) => void
}) {
  const dialogs = useDialogs()
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (opened) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- harness opens the dialog once on mount; standard test pattern.
    setOpened(true)
    void dialogs.prompt({
      title: 'New file',
      initialValue,
      placeholder: 'name.md',
      validate,
    }).then(onResult)
  }, [dialogs, initialValue, validate, onResult, opened])
  return null
}

function ConfirmHarness({
  message,
  onResult,
}: {
  message: string
  onResult: (v: boolean) => void
}) {
  const dialogs = useDialogs()
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (opened) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- harness opens the dialog once on mount; standard test pattern.
    setOpened(true)
    void dialogs.confirm({ title: 'Discard?', message, danger: true }).then(onResult)
  }, [dialogs, message, onResult, opened])
  return null
}

describe('DialogProvider — prompt', () => {
  it('resolves with the entered value when user clicks the submit button', async () => {
    const results: Array<string | null> = []
    const user = userEvent.setup()
    render(
      <DialogProvider>
        <PromptHarness initialValue="" onResult={(v) => results.push(v)} />
      </DialogProvider>,
    )
    await user.type(screen.getByPlaceholderText('name.md'), 'note.md')
    await user.click(screen.getByRole('button', { name: /ok/i }))
    expect(results).toEqual(['note.md'])
  })

  it('resolves with null when user clicks Cancel', async () => {
    const results: Array<string | null> = []
    const user = userEvent.setup()
    render(
      <DialogProvider>
        <PromptHarness onResult={(v) => results.push(v)} />
      </DialogProvider>,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(results).toEqual([null])
  })

  it('resolves with null when user presses Escape', async () => {
    const results: Array<string | null> = []
    const user = userEvent.setup()
    render(
      <DialogProvider>
        <PromptHarness onResult={(v) => results.push(v)} />
      </DialogProvider>,
    )
    await user.keyboard('{Escape}')
    expect(results).toEqual([null])
  })

  it('disables submit and shows the validate error', async () => {
    const validate = (v: string) => (v.endsWith('.md') ? null : 'Must end in .md')
    render(
      <DialogProvider>
        <PromptHarness
          initialValue="bad"
          validate={validate}
          onResult={() => {}}
        />
      </DialogProvider>,
    )
    expect(screen.getByText(/must end in \.md/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ok/i })).toBeDisabled()
  })
})

describe('DialogProvider — confirm', () => {
  it('resolves true when the confirm button is clicked', async () => {
    const results: boolean[] = []
    const user = userEvent.setup()
    render(
      <DialogProvider>
        <ConfirmHarness
          message="Discard unsaved changes to foo.md?"
          onResult={(v) => results.push(v)}
        />
      </DialogProvider>,
    )
    await user.click(screen.getByRole('button', { name: /^ok$/i }))
    expect(results).toEqual([true])
  })

  it('resolves false when the cancel button is clicked', async () => {
    const results: boolean[] = []
    const user = userEvent.setup()
    render(
      <DialogProvider>
        <ConfirmHarness
          message="Discard unsaved changes to foo.md?"
          onResult={(v) => results.push(v)}
        />
      </DialogProvider>,
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(results).toEqual([false])
  })

  it('resolves false when Escape is pressed', async () => {
    const results: boolean[] = []
    const user = userEvent.setup()
    render(
      <DialogProvider>
        <ConfirmHarness message="Delete it?" onResult={(v) => results.push(v)} />
      </DialogProvider>,
    )
    await user.keyboard('{Escape}')
    expect(results).toEqual([false])
  })
})

describe('useDialogs — outside provider', () => {
  it('throws a clear error when used without DialogProvider', () => {
    function Naive() {
      useDialogs()
      return null
    }
    expect(() => render(<Naive />)).toThrow(/useDialogs must be used inside <DialogProvider>/)
  })
})
