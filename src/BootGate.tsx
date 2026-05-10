import App from './App'
import { useModesState } from './hooks/useModes'
import { ErrorScreen } from './config/errorScreen'
import { DialogProvider } from './lib/dialogs'
import { ContextMenuProvider } from './lib/contextMenu'
import { DockPopoutBoot } from './components/ide/DockPopoutBoot'

function isPopoutMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('mode') === 'dock'
}

export function BootGate() {
  return isPopoutMode() ? <DockPopoutBoot /> : <MainBoot />
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
