export type ServeStatus =
  | { running: false }
  | { running: true; root: string; url: string; relPath: string }

export type ServeStartResult = { url: string } | { error: 'NO_INDEX' }

export interface CanvServe {
  start(absRoot: string): Promise<ServeStartResult>
  stop(): Promise<null>
  status(): Promise<ServeStatus>
  onStatusChanged(cb: (s: ServeStatus) => void): () => void
}

declare global {
  interface Window {
    canvServe?: CanvServe
  }
}

export function getServe(): CanvServe | null {
  if (typeof window === 'undefined') return null
  return window.canvServe ?? null
}
