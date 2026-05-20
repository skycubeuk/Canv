import { toDisposable } from '../lib/lifecycle'
import { registerContribution, type Contribution } from './index'
// Side-effect: pull in the global Window.canvMcp augmentation from the
// adapter so both modules see the same bridge shape.
import '../agents/mcp'

export const mcp: Contribution = {
  name: 'mcp',
  register(services) {
    // Diff before pushing — every settings keystroke (font-size, accent input,
    // etc.) fires the subscriber, and setServers triggers a full shutdown +
    // reconnect of every MCP subprocess. Without this guard, unrelated UI
    // would respawn the MCP servers on every keystroke.
    let lastSerialised: string | null = null
    const push = () => {
      const cfgs = services.settings.settings.mcpServers ?? []
      const serialised = JSON.stringify(cfgs)
      if (serialised === lastSerialised) return
      lastSerialised = serialised
      window.canvMcp?.setServers(cfgs).catch(() => {})
    }
    push()  // initial
    const unsub = services.settings.subscribe(push)
    return toDisposable(unsub)
  },
}

registerContribution(mcp)
