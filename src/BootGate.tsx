import App from './App'
import { useModesState } from './hooks/useModes'
import { ErrorScreen } from './config/errorScreen'
import { DialogProvider } from './lib/dialogs'
import { ContextMenuProvider } from './lib/contextMenu'
import { DockPopoutBoot } from './components/ide/DockPopoutBoot'
import { BuilderBoot } from './components/builder/BuilderBoot'

function readMode(): 'dock' | 'builder' | 'main' {
  if (typeof window === 'undefined') return 'main'
  const params = new URLSearchParams(window.location.search)
  const m = params.get('mode')
  if (m === 'dock') return 'dock'
  if (m === 'builder') return 'builder'
  return 'main'
}

export function BootGate() {
  const mode = readMode()
  if (mode === 'dock') return <DockPopoutBoot />
  if (mode === 'builder') return <BuilderBoot />
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
