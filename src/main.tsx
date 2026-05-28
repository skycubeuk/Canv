import './components/extensions/registerCanvIcon'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Note: the React DevTools connector is injected into index.html by the
// `react-devtools-connector` vite plugin in vite.config.ts. It must load
// BEFORE any React module initialises (which means before main.tsx runs at
// all), so it cannot live here — ES module imports above would already have
// pulled in React by the time a script appended from here gets parsed.
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
