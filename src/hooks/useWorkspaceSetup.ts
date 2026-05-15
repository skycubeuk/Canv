import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceConfig } from '../lib/historyTypes'
import type { WorkspaceSetupResult } from '../components/WorkspaceSetupModal'

export type SetupPhase = 'loading' | 'needs-setup' | 'ready' | 'cancelled'

interface FsLike {
  readWorkspaceConfig(): Promise<WorkspaceConfig | null>
  writeWorkspaceConfig(cfg: WorkspaceConfig): Promise<true>
}
interface HistoryLike {
  init(): Promise<{ branch: string; headCommit: string }>
}

export interface UseWorkspaceSetupArgs {
  workspaceReady: boolean
  workspaceRoot: string | null
  remote: boolean
  fs: FsLike
  history: HistoryLike
  defaultModeId: string
}

export interface UseWorkspaceSetupApi {
  phase: SetupPhase
  config: WorkspaceConfig | null
  confirm: (r: WorkspaceSetupResult) => Promise<void>
  cancel: () => void
}

export function useWorkspaceSetup(args: UseWorkspaceSetupArgs): UseWorkspaceSetupApi {
  const [phase, setPhase] = useState<SetupPhase>('loading')
  const [config, setConfig] = useState<WorkspaceConfig | null>(null)

  useEffect(() => {
    if (!args.workspaceReady) return
    if (!args.workspaceRoot) return
    let cancelled = false
    args.fs.readWorkspaceConfig().then((cfg) => {
      if (cancelled) return
      if (cfg) { setConfig(cfg); setPhase('ready') }
      else { setConfig(null); setPhase('needs-setup') }
    }).catch(() => { if (!cancelled) setPhase('needs-setup') })
    return () => { cancelled = true }
  }, [args.workspaceReady, args.workspaceRoot, args.fs])

  const confirm = useCallback(async (r: WorkspaceSetupResult) => {
    const raEnabled = r.enableRA && !args.remote
    const cfg: WorkspaceConfig = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      defaultProfile: r.defaultProfile,
      revisionArchaeology: raEnabled
        ? { enabled: true, backend: 'git-branch', branch: 'canv-history' }
        : { enabled: false },
    }
    await args.fs.writeWorkspaceConfig(cfg)
    if (raEnabled) await args.history.init()
    setConfig(cfg)
    setPhase('ready')
  }, [args.fs, args.history, args.remote])

  const cancel = useCallback(() => { setPhase('cancelled') }, [])

  return { phase, config, confirm, cancel }
}
