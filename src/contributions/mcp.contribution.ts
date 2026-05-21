import { toDisposable } from '../lib/lifecycle'
import { registerContribution, type Contribution } from './index'
import { McpServerConfigSchema, type McpServerConfig } from '../hooks/settingsSchema'
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
    //
    // The renderer view of `mcpServers` includes in-progress rows the user is
    // still filling in via the auto-gen settings UI (the storage schema is
    // permissive on purpose — see settingsSchema.ts). Filter to fully-valid
    // entries here so a half-typed new row doesn't crash the stdio spawn or
    // trigger keystroke-by-keystroke reconnect churn. A row becomes "live"
    // only once its name+command (or name+url) are non-empty and pass the
    // McpServerConfigSchema.
    let lastSerialised: string | null = null
    const push = () => {
      const raw = services.settings.settings.mcpServers ?? []
      const cfgs: McpServerConfig[] = []
      for (const item of raw) {
        const r = McpServerConfigSchema.safeParse(item)
        if (r.success) cfgs.push(r.data)
      }
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
