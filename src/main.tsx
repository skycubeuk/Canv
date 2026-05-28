import './components/extensions/registerCanvIcon'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Standalone React DevTools connector — dev only. The user runs
// `npx react-devtools` in a separate terminal to launch the DevTools UI on
// port 8097; this script tells the renderer to connect to it. The injection
// is gated on `import.meta.env.DEV` so production builds don't reach out to
// localhost (and so the script isn't even referenced in dist/).
if (import.meta.env.DEV) {
  const s = document.createElement('script')
  s.src = 'http://localhost:8097'
  document.head.appendChild(s)
}
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
