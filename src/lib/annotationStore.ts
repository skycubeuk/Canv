// src/lib/annotationStore.ts
// Thin renderer bridge for annotation sidecar persistence.
//
// Wraps window.canvAnnotations (exposed by electron/preload.cjs). In the web
// build the preload is absent, so every call degrades to a safe no-op / [].
// Never throws into the renderer.

import type { ContentAnchor } from './suggestions/anchor'

export interface AnnotationRecord {
  id: string
  anchor: ContentAnchor
  note: string
  author: string
  suggestedReplacement?: string
}

interface CanvAnnotationsApi {
  load: (rel: string) => Promise<AnnotationRecord[]>
  save: (rel: string, records: AnnotationRecord[]) => Promise<void>
}

function getApi(): CanvAnnotationsApi | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { canvAnnotations?: CanvAnnotationsApi }).canvAnnotations
}

export async function loadAnnotations(rel: string): Promise<AnnotationRecord[]> {
  const api = getApi()
  if (!api) return []
  try {
    const records = await api.load(rel)
    return Array.isArray(records) ? records : []
  } catch {
    return []
  }
}

export async function saveAnnotations(rel: string, records: AnnotationRecord[]): Promise<void> {
  const api = getApi()
  if (!api) return
  try {
    await api.save(rel, records)
  } catch {
    // best-effort save; never propagate into the renderer
  }
}
