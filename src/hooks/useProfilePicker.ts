import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type PickerMode = 'first-launch' | 'switch'

export interface UseProfilePickerArgs {
  profile: string | null
  setProfile: (id: string | null) => void
  workspaceReady: boolean
  workspaceRoot: string | null
  migrationOpen: boolean
}

export interface UseProfilePickerApi {
  open: boolean
  mode: PickerMode
  pickProfile: (profileId: string) => void
  cancel: () => void
  openSwitcher: () => void
}

export function useProfilePicker(args: UseProfilePickerArgs): UseProfilePickerApi {
  const { profile, setProfile, workspaceReady, workspaceRoot, migrationOpen } = args

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PickerMode>('first-launch')

  const bootstrappedRef = useRef(false)
  useEffect(() => {
    if (bootstrappedRef.current) return
    if (!workspaceReady) return
    if (!workspaceRoot) return
    if (migrationOpen) return
    if (profile) {
      bootstrappedRef.current = true
      return
    }
    bootstrappedRef.current = true
    setTimeout(() => {
      setMode('first-launch')
      setOpen(true)
    }, 0)
  }, [profile, workspaceReady, workspaceRoot, migrationOpen])

  const pickProfile = useCallback((profileId: string) => {
    setProfile(profileId)
    setOpen(false)
  }, [setProfile])

  const cancel = useCallback(() => {
    if (mode === 'switch') setOpen(false)
  }, [mode])

  const openSwitcher = useCallback(() => {
    setMode('switch')
    setOpen(true)
  }, [])

  return useMemo<UseProfilePickerApi>(() => ({
    open, mode, pickProfile, cancel, openSwitcher,
  }), [open, mode, pickProfile, cancel, openSwitcher])
}
