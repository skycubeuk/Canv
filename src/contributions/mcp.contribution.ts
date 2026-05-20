import { toDisposable } from '../lib/lifecycle'
import { registerContribution, type Contribution } from './index'
// Side-effect: pull in the global Window.canvMcp augmentation from the
// adapter so both modules see the same bridge shape.
import '../agents/mcp'

export const mcp: Contribution = {
  name: 'mcp',
  register(services) {
    const push = () => {
      const cfgs = services.settings.settings.mcpServers ?? []
      window.canvMcp?.setServers(cfgs).catch(() => {})
    }
    push()  // initial
    const unsub = services.settings.subscribe(push)
    return toDisposable(unsub)
  },
}

registerContribution(mcp)
