import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ICanvServices } from '../services'
import type { Settings } from '../hooks/settingsSchema'

type HostRequestCb = (reqId: number, method: string, args: unknown[]) => void

interface DevApi {
  spawnTest: ReturnType<typeof vi.fn>
  destroyTest: ReturnType<typeof vi.fn>
  setBounds: ReturnType<typeof vi.fn>
  onNotification: ReturnType<typeof vi.fn>
  onHostRequest: (cb: HostRequestCb) => () => void
  hostReply: ReturnType<typeof vi.fn>
  fireEvent: ReturnType<typeof vi.fn>
}

const completeMock = vi.fn()

vi.mock('../adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../adapters')>()
  return {
    ...actual,
    getAdapter: (id: string) => ({
      name: 'Mock',
      id,
      models: id === 'openai' ? ['gpt-4o', 'gpt-4o-mini'] : ['claude-sonnet-4-6'],
      complete: completeMock,
    }),
  }
})

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    provider: 'anthropic',
    defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-4o', ollama: 'llama3.1' },
    apiKeys: { anthropic: '', openai: '', ollama: '' },
    maxOutputTokens: { anthropic: 4096, openai: 4096, ollama: 4096 },
    baseUrls: {},
    ollamaModels: [],
    ...overrides,
  } as unknown as Settings
}

function makeServices(settings: Settings): ICanvServices {
  return {
    settings: { settings },
    editorRegistry: { getActiveEditor: () => null },
    workspace: { activeMarkdownRel: null },
    modes: {
      modes: [{ id: 'default', chatSystemPrompt: 'You are helpful.' }],
      profile: 'default',
      defaultModeId: 'default',
    },
    notifications: { showToast: () => {} },
  } as unknown as ICanvServices
}

describe('extension-host-bridge — ai.ask provider resolution', () => {
  let listener: HostRequestCb | null = null
  let dev: DevApi
  let originalDev: unknown

  beforeEach(() => {
    completeMock.mockReset()
    listener = null
    originalDev = (window as unknown as { canvExtensionsDev?: DevApi }).canvExtensionsDev
    dev = {
      spawnTest: vi.fn(),
      destroyTest: vi.fn(),
      setBounds: vi.fn(),
      onNotification: vi.fn(() => () => {}),
      onHostRequest: (cb) => { listener = cb; return () => {} },
      hostReply: vi.fn(),
      fireEvent: vi.fn(),
    }
    ;(window as unknown as { canvExtensionsDev: DevApi }).canvExtensionsDev = dev
  })

  afterEach(() => {
    if (originalDev === undefined) {
      delete (window as unknown as { canvExtensionsDev?: unknown }).canvExtensionsDev
    } else {
      ;(window as unknown as { canvExtensionsDev: unknown }).canvExtensionsDev = originalDev
    }
  })

  it('uses the effective default — not raw settings.provider — when resolving the provider', async () => {
    // settings.provider is anthropic (no key) but openai IS configured.
    // The chat panel picks openai via pickDefaultProviderModel; ai.ask must
    // do the same instead of erroring on the stale stored default.
    const settings = makeSettings({
      provider: 'anthropic',
      apiKeys: { anthropic: '', openai: 'sk-openai', ollama: '' },
    })
    const services = makeServices(settings)
    completeMock.mockResolvedValue({ text: 'summary', tokenUsage: { input: 5, output: 7 } })

    const { extensionHostBridge } = await import('./extension-host-bridge.contribution')
    extensionHostBridge.register(services)

    listener!(42, 'ai.ask', [{ extensionId: 'hello-world', prompt: 'Summarise.' }])
    await new Promise((r) => setTimeout(r, 0))

    expect(completeMock).toHaveBeenCalledTimes(1)
    const call = completeMock.mock.calls[0][0]
    expect(call.apiKey).toBe('sk-openai')
    expect(call.model).toBe('gpt-4o')
    expect(dev.hostReply).toHaveBeenCalledWith(42, true, expect.objectContaining({
      text: 'summary',
      usage: { in: 5, out: 7 },
    }))
  })

  it('surfaces a friendly error when no provider has credentials anywhere', async () => {
    const settings = makeSettings({ apiKeys: { anthropic: '', openai: '', ollama: '' } })
    const services = makeServices(settings)

    const { extensionHostBridge } = await import('./extension-host-bridge.contribution')
    extensionHostBridge.register(services)

    listener!(7, 'ai.ask', [{ extensionId: 'hello-world', prompt: 'hi' }])
    await new Promise((r) => setTimeout(r, 0))

    expect(completeMock).not.toHaveBeenCalled()
    expect(dev.hostReply).toHaveBeenCalledWith(7, false, expect.stringMatching(/no API key configured.*Settings/i))
  })

  it('respects a fully-configured stored default when it matches reality', async () => {
    const settings = makeSettings({
      provider: 'openai',
      apiKeys: { anthropic: 'k', openai: 'sk-openai', ollama: '' },
    })
    const services = makeServices(settings)
    completeMock.mockResolvedValue({ text: 'ok', tokenUsage: { input: 1, output: 1 } })

    const { extensionHostBridge } = await import('./extension-host-bridge.contribution')
    extensionHostBridge.register(services)

    listener!(1, 'ai.ask', [{ extensionId: 'hello-world', prompt: 'hi' }])
    await new Promise((r) => setTimeout(r, 0))

    expect(completeMock).toHaveBeenCalledTimes(1)
    expect(completeMock.mock.calls[0][0].apiKey).toBe('sk-openai')
    expect(completeMock.mock.calls[0][0].model).toBe('gpt-4o')
  })
})
