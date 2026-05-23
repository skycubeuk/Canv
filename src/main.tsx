import './components/extensions/registerCanvIcon'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './index.css'
import { ModesProvider } from './hooks/useModes'
import { BootGate } from './BootGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ModesProvider>
      <BootGate />
    </ModesProvider>
  </StrictMode>,
)
