import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsTab } from './SettingsTab'

vi.mock('../../../hooks/useModes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useModes')>()
  return { ...actual, useModes: () => ({ modes: [], defaultModeId: '' }) }
})

vi.mock('../../../lib/dialogs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/dialogs')>()
  return { ...actual, useDialogs: () => ({ confirm: vi.fn(), prompt: vi.fn() }) }
})

const minimalSettings = {
  provider: 'anthropic',
  apiKeys: { anthropic: '', openai: '', ollama: '' },
  defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5', ollama: 'llama3.1' },
  useDefaultModelForAll: true,
  perAgentModel: {},
  fontSize: 16,
  chatFontSize: 14,
  lineWidth: 'normal',
  theme: 'system',
  streaming: true,
  maxOutputTokens: { anthropic: 8192, openai: 8192, ollama: 4096 },
  baseUrls: { ollama: '' },
  ollamaModels: [],
  chatToolBudget: 10,
  pricingOverrides: {},
  streamChunkDelayMs: 0,
  autoScroll: true,
  lintRules: { brokenLinks: true, frontMatter: true, headingSkip: true, deadImages: true },
  mcpServers: [],
  tts: { provider: 'elevenlabs', apiKey: '', defaultVoiceId: '', defaultVoiceName: '', defaultModelId: 'eleven_multilingual_v2' },
}

describe('SettingsTab — Read aloud section', () => {
  it('renders the ElevenLabs API key field', () => {
    render(<SettingsTab settings={minimalSettings as never} onUpdate={vi.fn()} onExportBackup={vi.fn()} />)
    expect(screen.getByText(/Read aloud/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/ElevenLabs/i)).toBeTruthy()
  })
})
