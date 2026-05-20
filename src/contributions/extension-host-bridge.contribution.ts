import { DisposableStore, toDisposable } from '../lib/lifecycle'
import { registerContribution, type Contribution } from './index'
import { getAdapter } from '../adapters'

// The host bridge that replies to canvExtHost:request from the main process.
// Previously lived in src/components/extensions/TestExtensionOverlay.tsx and
// only ran when a dev flag was set. The overlay was removed from App.tsx on
// 2026-05-19 because its UI button was leaking into the chrome — but the
// bridge inside it was load-bearing for every installed extension that calls
// canv.activeDoc.* / canv.ai.ask, so those calls have been timing out since.
// This contribution re-installs the bridge unconditionally.
//
// The Window.canvExtensionsDev shape is already declared by
// src/components/extensions/TestExtensionOverlay.tsx — we read from the same
// global without redeclaring.

export const extensionHostBridge: Contribution = {
  name: 'extension-host-bridge',
  register(services) {
    const store = new DisposableStore()
    const dev = window.canvExtensionsDev
    if (!dev) return store   // no bridge available (e.g. unit tests, missing preload)

    const offR = dev.onHostRequest((reqId, method, args) => {
      try {
        const view = services.editorRegistry.getActiveEditor()

        if (method === 'activeDoc.getText') {
          dev.hostReply(reqId, true, view ? view.state.doc.toString() : '')
          return
        }
        if (method === 'activeDoc.getPath') {
          dev.hostReply(reqId, true, services.workspace.activeMarkdownRel ?? null)
          return
        }
        if (method === 'activeDoc.getSelection') {
          if (!view) {
            dev.hostReply(reqId, true, { from: 0, to: 0, text: '' })
          } else {
            const sel = view.state.selection.main
            const text = view.state.sliceDoc(sel.from, sel.to)
            dev.hostReply(reqId, true, { from: sel.from, to: sel.to, text })
          }
          return
        }
        if (method === 'activeDoc.insertAtCursor') {
          if (!view) {
            dev.hostReply(reqId, false, 'no active editor')
            return
          }
          const insertText = typeof args[0] === 'string' ? args[0] : ''
          const sel = view.state.selection.main
          view.dispatch({
            changes: { from: sel.from, to: sel.from, insert: insertText },
            selection: { anchor: sel.from + insertText.length },
          })
          dev.hostReply(reqId, true, null)
          return
        }
        if (method === 'activeDoc.replaceSelection') {
          if (!view) {
            dev.hostReply(reqId, false, 'no active editor')
            return
          }
          const replaceText = typeof args[0] === 'string' ? args[0] : ''
          const sel = view.state.selection.main
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: replaceText },
            selection: { anchor: sel.from + replaceText.length },
          })
          dev.hostReply(reqId, true, null)
          return
        }
        if (method === 'activeDoc.setText') {
          if (!view) {
            dev.hostReply(reqId, false, 'no active editor')
            return
          }
          const newText = typeof args[0] === 'string' ? args[0] : ''
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: newText } })
          dev.hostReply(reqId, true, null)
          return
        }
        if (method === 'ai.ask') {
          const params = (args[0] ?? {}) as {
            extensionId: string
            prompt: string
            system?: string
            maxTokens?: number
            profileId?: string
          }
          void (async () => {
            try {
              const s = services.settings.settings
              const provider = s.provider
              const apiKey = s.apiKeys[provider]
              if (!apiKey) throw new Error(`no API key configured for provider "${provider}"`)
              const modesSvc = services.modes
              const activeProfile =
                modesSvc.modes.find((m) => m.id === (modesSvc.profile ?? modesSvc.defaultModeId)) ??
                modesSvc.modes[0]
              const adapter = getAdapter(provider)
              const result = await adapter.complete({
                model: s.defaultModel[provider],
                apiKey,
                baseUrl: s.baseUrls?.[provider],
                maxTokens: params.maxTokens ?? s.maxOutputTokens[provider],
                system: params.system ?? activeProfile.chatSystemPrompt,
                messages: [{ role: 'user', content: params.prompt }],
              })
              dev.hostReply(reqId, true, {
                text: result.text,
                usage: {
                  in: result.tokenUsage?.input ?? 0,
                  out: result.tokenUsage?.output ?? 0,
                },
              })
            } catch (err) {
              dev.hostReply(reqId, false, (err as Error).message)
            }
          })()
          return
        }
        dev.hostReply(reqId, false, `unknown host method: ${method}`)
      } catch (e) {
        dev.hostReply(reqId, false, (e as Error).message)
      }
    })
    store.add(toDisposable(offR))

    return store
  },
}

registerContribution(extensionHostBridge)
