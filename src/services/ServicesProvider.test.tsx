import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ServicesProvider } from './ServicesProvider'
import { useService } from './useService'
import { DialogProvider } from '../lib/dialogs'
import { ContextMenuProvider } from '../lib/contextMenu'
import { ModesProvider, useModesState } from '../hooks/useModes'

afterEach(cleanup)

// Stub the Electron fs bridge — the provider's workspace hooks need it.
const fsMock = {
  pickWorkspace: vi.fn(),
  setWorkspace: vi.fn(),
  getWorkspace: vi.fn().mockResolvedValue(null),
  listDir: vi.fn().mockResolvedValue({ name: '', relPath: '', kind: 'dir', children: [], truncated: false }),
  readFile: vi.fn().mockResolvedValue({ ok: true, content: '', mtimeMs: 1, eol: 'lf', bom: false, size: 0 }),
  writeFile: vi.fn().mockResolvedValue({ mtimeMs: 1 }),
  createFile: vi.fn(),
  createFolder: vi.fn(),
  rename: vi.fn(),
  delete: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  closeWorkspace: vi.fn(),
  getWorkspaceKind: vi.fn().mockResolvedValue(null),
}

beforeEach(() => {
  ;(window as unknown as { canvFS: typeof fsMock }).canvFS = fsMock
  localStorage.clear()
})

// Mirrors the app's boot stack (BootGate): modes must finish loading before
// anything under ServicesProvider calls useModes(). Outside Electron,
// loadModes() resolves from the bundled defaults.
function ModesGate({ children }: { children: ReactNode }) {
  const state = useModesState()
  if (state.status !== 'ready') return null
  return <>{children}</>
}

const Providers = ({ children }: { children: ReactNode }) => (
  <ModesProvider>
    <ModesGate>
      <DialogProvider>
        <ContextMenuProvider>
          <ServicesProvider>{children}</ServicesProvider>
        </ContextMenuProvider>
      </DialogProvider>
    </ModesGate>
  </ModesProvider>
)

function Probe() {
  const settings = useService('settings')
  const notifications = useService('notifications')
  const workspace = useService('workspace')
  return (
    <div>
      <span data-testid="provider">{settings.settings.provider}</span>
      <span data-testid="toast">{String(notifications.toast)}</span>
      <span data-testid="ws">{String(workspace.tree === null)}</span>
    </div>
  )
}

describe('ServicesProvider', () => {
  it('mounts the full registry and serves real hook outputs through useService', async () => {
    await act(async () => {
      render(
        <Providers>
          <Probe />
        </Providers>,
      )
    })
    // Settings default provider resolves, notifications start empty, and the
    // workspace starts closed — i.e. the provider wired live hook state, not
    // stubs, through the store.
    expect(screen.getByTestId('provider').textContent).toBeTruthy()
    expect(screen.getByTestId('toast').textContent).toBe('null')
    expect(screen.getByTestId('ws').textContent).toBe('true')
  })

  it('serves every core key declared in ICanvServices', async () => {
    const seen = new Set<string>()
    function KeysProbe() {
      const keys = ['workspace', 'settings', 'editorRegistry', 'commands', 'contributions', 'modes', 'chatSessions', 'suggestions'] as const
      for (const k of keys) {
        // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-order loop over constants
        const v = useService(k)
        if (v !== undefined && v !== null) seen.add(k)
      }
      return null
    }
    await act(async () => {
      render(
        <Providers>
          <KeysProbe />
        </Providers>,
      )
    })
    expect([...seen].sort()).toEqual(
      ['chatSessions', 'commands', 'contributions', 'editorRegistry', 'modes', 'settings', 'suggestions', 'workspace'],
    )
  })
})
