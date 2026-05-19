import { useEffect, useState, useCallback } from 'react'
import { useContributions } from './useContributions'
import type { FileHandlerRecord } from '../types/extension-contributions'

export interface FileHandlerRouting {
  ready: boolean
  resolve: (relOrAbsPath: string) => FileHandlerRecord | null
  list: (relOrAbsPath: string) => FileHandlerRecord[]
}

function extOf(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i).toLowerCase() : ''
}

export function useFileHandlerRouting(): FileHandlerRouting {
  const contributions = useContributions()
  const [defaults, setDefaults] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const d = (await window.canvExtensions?.getFileHandlerDefaults?.()) ?? {}
      if (cancelled) return
      setDefaults(d)
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [contributions.fileHandlers.length])

  const list = useCallback((p: string): FileHandlerRecord[] => {
    const ext = extOf(p)
    if (!ext) return []
    return contributions.fileHandlers.filter((h) => h.extensions.includes(ext))
  }, [contributions.fileHandlers])

  const resolve = useCallback((p: string): FileHandlerRecord | null => {
    const matches = list(p)
    if (matches.length === 0) return null
    const def = defaults[extOf(p)]
    if (def) {
      const m = matches.find((h) => h.extensionId === def)
      if (m) return m
    }
    return matches[matches.length - 1]
  }, [list, defaults])

  return { ready, resolve, list }
}
