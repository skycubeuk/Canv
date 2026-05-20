import { toDisposable, type Disposable } from '../lib/lifecycle'
import { registerContribution, type Contribution } from './index'

type EngineMismatchPayload = { id: string; message: string }

interface CanvExtensionsWindowApi {
  onEngineMismatch?: (cb: (p: EngineMismatchPayload) => void) => () => void
}

/**
 * Surface the main process's `canvExtensions:engineMismatch` IPC event as a
 * toast in the renderer. Fires when an extension's `engines.canv` range no
 * longer satisfies the host API version (CANV_API_VERSION) at spawn time —
 * e.g. after a Canv upgrade that bumped the API major. Mirrors the existing
 * `:crashed` subscription idiom in ExtensionsTab but routes through the
 * notifications service so the user sees one toast per failure rather than a
 * status badge buried in a tab.
 */
export const extensionEngineMismatch: Contribution = {
  name: 'extension-engine-mismatch',
  register(services): Disposable {
    const api = (window as unknown as { canvExtensions?: CanvExtensionsWindowApi }).canvExtensions
    const off = api?.onEngineMismatch?.((payload) => {
      services.notifications.showToast(
        `Extension "${payload.id}" cannot load: ${payload.message}. Update or remove it.`,
      )
    })
    return toDisposable(() => { off?.() })
  },
}

registerContribution(extensionEngineMismatch)
