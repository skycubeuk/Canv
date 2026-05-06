import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Newspaper } from 'lucide-react'
import { StatusBar } from './StatusBar'
import { makeTestMode } from '../../test/fixtures'

function makeProfile() {
  return makeTestMode({ id: 'factual', label: 'Factual', icon: Newspaper })
}

describe('StatusBar', () => {
  it('does not render the API-key warning when apiKeyMissing is false', () => {
    render(
      <StatusBar
        saveState="saved"
        profile={makeProfile()}
        workspaceName={null}
        kind={null}
        wordCount={0}
        selectionWordCount={null}
        onClickProfile={vi.fn()}
        apiKeyMissing={false}
        onClickApiKeyWarning={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /no api key/i })).toBeNull()
  })

  it('renders the API-key warning at the left when apiKeyMissing is true', () => {
    render(
      <StatusBar
        saveState="saved"
        profile={makeProfile()}
        workspaceName={null}
        kind={null}
        wordCount={0}
        selectionWordCount={null}
        onClickProfile={vi.fn()}
        apiKeyMissing={true}
        onClickApiKeyWarning={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /no api key/i })).toBeInTheDocument()
  })

  it('clicking the warning calls onClickApiKeyWarning', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <StatusBar
        saveState="saved"
        profile={makeProfile()}
        workspaceName={null}
        kind={null}
        wordCount={0}
        selectionWordCount={null}
        onClickProfile={vi.fn()}
        apiKeyMissing={true}
        onClickApiKeyWarning={onClick}
      />,
    )
    await user.click(screen.getByRole('button', { name: /no api key/i }))
    expect(onClick).toHaveBeenCalled()
  })

  it('does not render a provider · model button anywhere', () => {
    render(
      <StatusBar
        saveState="saved"
        profile={makeProfile()}
        workspaceName={null}
        kind={null}
        wordCount={0}
        selectionWordCount={null}
        onClickProfile={vi.fn()}
        apiKeyMissing={false}
        onClickApiKeyWarning={vi.fn()}
      />,
    )
    expect(screen.queryByText(/anthropic|openai/i)).toBeNull()
  })

  it('renders the profile button as plain text without an SVG icon', () => {
    render(
      <StatusBar
        saveState="saved"
        profile={makeProfile()}
        workspaceName={null}
        kind={null}
        wordCount={0}
        selectionWordCount={null}
        onClickProfile={vi.fn()}
        apiKeyMissing={false}
        onClickApiKeyWarning={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: /factual/i })
    expect(button.querySelector('svg')).toBeNull()
    expect(button.textContent).toMatch(/factual/i)
  })
})
