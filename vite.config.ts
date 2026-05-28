import { defineConfig, type Plugin } from 'vite'
import { createRequire } from 'node:module'

const pkg = createRequire(import.meta.url)('./package.json') as { version: string }
import react from '@vitejs/plugin-react'

// Strict CSP for the packaged app. The meta tag in index.html ships this
// to production. In dev, Vite's HMR needs ws + eval, so we swap a relaxed
// CSP in via transformIndexHtml below.
//
// `connect-src` includes `http:` so the user-configurable Ollama base URL
// works (localhost by default, but the spec allows pointing at a LAN host).
// CSP can't express "private network only", and we ship to a single trusted
// renderer with no remote untrusted content loaded, so the trade-off is
// acceptable for the spike. Tighten if/when an Electron-main IPC proxy lands.
// `canv-extension:` is allowed in script-src + connect-src so the main
// renderer can dynamic-import language contributions served via Canv's
// custom protocol. Without it, Phase 5b `language` extensions are blocked
// before their default-export function ever runs.
const PROD_CSP =
  "default-src 'self'; " +
  "script-src 'self' canv-extension:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; " +
  "img-src 'self' data: blob:; " +
  // Read-aloud recordings are streamed from Electron main via the privileged
  // canv-rec:// protocol; without this, <audio> loads fall back to default-src
  // 'self' and Chromium's CSP blocks playback.
  "media-src 'self' canv-rec:; " +
  "connect-src http: https://api.anthropic.com https://api.openai.com canv-extension:; " +
  "worker-src 'self' blob:; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "frame-ancestors 'none';"

// Dev CSP also allows http://localhost:8097, where the standalone React
// DevTools (`npx react-devtools`) serves its connector script. Renderer
// dynamically injects <script src="http://localhost:8097"> in DEV mode (see
// src/main.tsx); without the script-src + connect-src whitelist Chromium
// would block it.
const DEV_CSP =
  "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:8097 canv-extension:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' canv-rec:; " +
  "connect-src 'self' ws: wss: http: https://api.anthropic.com https://api.openai.com canv-extension:; " +
  "worker-src 'self' blob:;"

function cspByMode(): Plugin {
  return {
    name: 'csp-by-mode',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const csp = ctx.server ? DEV_CSP : PROD_CSP
        return html.replace(
          /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i,
          `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
        )
      },
    },
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), cspByMode()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
})
