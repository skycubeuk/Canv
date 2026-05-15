import { defineConfig, type Plugin } from 'vite'
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
const PROD_CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; " +
  "img-src 'self' data: blob:; " +
  "connect-src http: https://api.anthropic.com https://api.openai.com; " +
  "worker-src 'self' blob:; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "frame-ancestors 'none';"

const DEV_CSP =
  "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'self' ws: wss: http: https://api.anthropic.com https://api.openai.com; " +
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
  plugins: [react(), cspByMode()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
})
