import { toDisposable, type Disposable } from '../lib/lifecycle'
import { registerContribution, type Contribution } from './index'

/**
 * Listen for the `canv:quota-error` window event emitted by useLocalStorage
 * when writes hit QuotaExceededError, and surface it as a toast. Pre-Phase-2
 * this effect lived in App.tsx.
 */
export const quotaError: Contribution = {
  name: 'quota-error',
  register(services): Disposable {
    const handler = () =>
      services.notifications.showToast('Storage full — export your runs/chat or trim them')
    window.addEventListener('canv:quota-error', handler)
    return toDisposable(() => window.removeEventListener('canv:quota-error', handler))
  },
}

registerContribution(quotaError)
