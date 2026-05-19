import App from './App'
import { useModesState } from './hooks/useModes'
import { ErrorScreen } from './config/errorScreen'
import { DialogProvider } from './lib/dialogs'
import { ContextMenuProvider } from './lib/contextMenu'
import { DockPopoutBoot } from './components/ide/DockPopoutBoot'

function readMode(): 'dock' | 'main' {
  if (typeof window === 'undefined') return 'main'
  const params = new URLSearchParams(window.location.search)
  if (params.get('mode') === 'dock') return 'dock'
  return 'main'
}

export function BootGate() {
  const mode = readMode()
  if (mode === 'dock') return <DockPopoutBoot />
  return <MainBoot />
}

function MainBoot() {
  const state = useModesState()
  if (state.status === 'loading') {
    return null
  }
  if (state.status === 'error') {
    const onReveal = window.canvConfig?.revealFolder
    return <ErrorScreen errors={state.errors} configDir={state.configDir} onReveal={onReveal} />
  }
  return (
    <DialogProvider>
      <ContextMenuProvider>
        <App />
      </ContextMenuProvider>
    </DialogProvider>
  )
}
