export interface SiteEntry {
  id: string
  name: string
  description: string
  folder: string
  entry: string
  created: string
  updated: string
  prompt: string
  source_files: string[]
  pinned: boolean
}

export interface SiteEntryWithStaleness extends SiteEntry {
  stale: boolean
}

declare global {
  interface Window {
    canvSites?: {
      list: () => Promise<SiteEntry[]>
      listWithStaleness: () => Promise<SiteEntryWithStaleness[]>
      register: (input: unknown) => Promise<{ entry: SiteEntry; url: string }>
      update: (id: string, patch: Partial<SiteEntry>) => Promise<SiteEntry>
      open: (id: string) => Promise<{ url: string }>
      delete: (id: string) => Promise<void>
      setPinned: (id: string, pinned: boolean) => Promise<SiteEntry>
      onRegistryChanged: (cb: () => void) => () => void
    }
  }
}

export {}
