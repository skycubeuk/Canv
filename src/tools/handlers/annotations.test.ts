import { describe, it, expect, vi } from 'vitest'
import { makeMockFs, makeCtx } from '../../test/fixtures'
import { listAnnotationsTool } from './listAnnotations'
import { addAnnotationTool } from './addAnnotation'
import { updateAnnotationTool } from './updateAnnotation'
import { removeAnnotationTool } from './removeAnnotation'
import type { AnnotationsCapability } from '../types'

function caps(over: Partial<AnnotationsCapability> = {}): AnnotationsCapability {
  return {
    list: vi.fn(() => [{ id: 'a1', quote: 'cat', note: 'n', author: 'Assistant', status: 'open' as const }]),
    add: vi.fn(() => ({ id: 'a9' })),
    update: vi.fn(),
    remove: vi.fn(),
    ...over,
  }
}

describe('list_annotations', () => {
  it('returns annotations for the active doc, defaulting path', async () => {
    const annotations = caps()
    const ctx = makeCtx({ fs: makeMockFs({}), activeDocPath: 'doc.md', annotations })
    const out = await listAnnotationsTool.handler({}, ctx)
    expect(annotations.list).toHaveBeenCalledWith('doc.md')
    expect(out).toEqual({ annotations: [{ id: 'a1', quote: 'cat', note: 'n', author: 'Assistant', status: 'open' }] })
  })

  it('errors when no document is open', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}), activeDocPath: null, annotations: caps() })
    await expect(listAnnotationsTool.handler({}, ctx)).rejects.toThrow(/no document is open/)
  })

  it('errors when the path is not the active doc', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}), activeDocPath: 'doc.md', annotations: caps({ list: () => null }) })
    await expect(listAnnotationsTool.handler({ path: 'other.md' }, ctx)).rejects.toThrow(/open other\.md/)
  })
})

describe('add_annotation', () => {
  it('delegates to annotations.add and returns the id', async () => {
    const annotations = caps()
    const ctx = makeCtx({ fs: makeMockFs({}), activeDocPath: 'doc.md', annotations })
    const out = await addAnnotationTool.handler({ quote: 'cat', note: 'hi', suggestedReplacement: 'dog' }, ctx)
    expect(annotations.add).toHaveBeenCalledWith('doc.md', { quote: 'cat', note: 'hi', suggestedReplacement: 'dog' })
    expect(out).toEqual({ id: 'a9' })
  })

  it('errors when quote or note is missing', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}), activeDocPath: 'doc.md', annotations: caps() })
    await expect(addAnnotationTool.handler({ quote: '', note: 'x' } as never, ctx)).rejects.toThrow(/quote/)
    await expect(addAnnotationTool.handler({ quote: 'cat' } as never, ctx)).rejects.toThrow(/note/)
  })
})

describe('update_annotation', () => {
  it('delegates patch fields', async () => {
    const annotations = caps()
    const ctx = makeCtx({ fs: makeMockFs({}), activeDocPath: 'doc.md', annotations })
    const out = await updateAnnotationTool.handler({ id: 'a1', note: 'new' }, ctx)
    expect(annotations.update).toHaveBeenCalledWith('doc.md', { id: 'a1', note: 'new', suggestedReplacement: undefined })
    expect(out).toEqual({ ok: true })
  })

  it('errors when neither note nor suggestedReplacement is given', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}), activeDocPath: 'doc.md', annotations: caps() })
    await expect(updateAnnotationTool.handler({ id: 'a1' }, ctx)).rejects.toThrow(/nothing to update/)
  })
})

describe('remove_annotation', () => {
  it('delegates to annotations.remove', async () => {
    const annotations = caps()
    const ctx = makeCtx({ fs: makeMockFs({}), activeDocPath: 'doc.md', annotations })
    const out = await removeAnnotationTool.handler({ id: 'a1' }, ctx)
    expect(annotations.remove).toHaveBeenCalledWith('doc.md', 'a1')
    expect(out).toEqual({ ok: true })
  })
})
