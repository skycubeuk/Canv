import { DisposableStore, toDisposable } from '../lib/lifecycle'
import { ollamaAdapter } from '../adapters/ollama'
import { registerContribution, type Contribution } from './index'

/**
 * Auto-refresh the cached Ollama model list whenever the configured base URL
 * changes. Silent on failure — keep the previous list so transient outages
 * (server down, network blip) don't wipe a working configuration.
 *
 * Replaces a useEffect in App.tsx that did the same thing.
 */
export const ollama: Contribution = {
  name: 'ollama',
  register(services) {
    const store = new DisposableStore()
    let cancelled = false
    let lastUrl: string | undefined

    const refresh = async (url: string) => {
      try {
        const names = await ollamaAdapter.listModels!({ baseUrl: url })
        if (cancelled) return
        services.settings.update({ ollamaModels: names })
      } catch {
        // Ollama not reachable. Keep the existing list as-is.
      }
    }

    const sync = () => {
      const url = services.settings.settings.baseUrls?.ollama
      if (url === lastUrl) return
      lastUrl = url
      if (!url) return
      void refresh(url)
    }

    sync()

    const unsub = services.settings.subscribe(sync)
    store.add(toDisposable(unsub))
    store.add(toDisposable(() => { cancelled = true }))
    return store
  },
}

registerContribution(ollama)
