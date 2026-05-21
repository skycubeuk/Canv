/**
 * Renderer-side anchor-based edit applier.
 *
 * Reads each affected file once via canvFS.readFile, validates anchor
 * uniqueness, builds the new content in memory, then forwards a single
 * batched canvFS:applyEdits IPC call. Atomicity (cross-file rollback)
 * lives in the main-process handler — see electron/services/fs/index.cjs.
 *
 * This split keeps anchor parsing / uniqueness checks on the renderer
 * (close to the model that produces the anchors) and the atomic write
 * machinery in main (where it has direct fs access).
 */

export interface AnchorEdit {
  path: string
  oldText: string
  newText: string
  /** Optional optimistic-concurrency check. If set, overrides the read-time mtime. */
  expectedMtimeMs?: number
}

export interface ApplyEditsOk {
  ok: true
  applied: Array<{ path: string; mtimeMs: number }>
}

export interface ApplyEditsErrorPayload {
  reason:
    | 'anchor-not-found'
    | 'anchor-not-unique'
    | 'file-not-found'
    | 'path-outside-workspace'
    | 'stale-mtime'
    | 'file-dirty'
    | 'write-failed'
    | 'unsupported-remote'
  path: string
  detail?: string
  /** When reason === 'anchor-not-unique', the number of matches found. */
  matches?: number
  /**
   * When reason === 'write-failed', the subset of files whose rollback ALSO
   * failed — the workspace is half-written and these paths now hold the
   * partially-applied content. Surface this to the user verbatim so they can
   * recover by hand. Absent when every rollback succeeded.
   */
  rollbackFailed?: string[]
}

export interface ApplyEditsErr {
  ok: false
  error: ApplyEditsErrorPayload
}

export type ApplyEditsResult = ApplyEditsOk | ApplyEditsErr

export interface ApplyEditsDeps {
  /** Returns true if the renderer holds unsaved changes for the given path. */
  isDirty: (relPath: string) => boolean
}

interface FileWrite {
  path: string
  newContent: string
  expectedMtimeMs?: number
  opts: { eol: 'lf' | 'crlf'; bom: boolean }
}

interface ReadResultOk {
  ok: true
  content: string
  mtimeMs: number
  eol: 'lf' | 'crlf'
  bom: boolean
}

interface CanvFsApplyEditsBridge {
  readFile: (rel: string) => Promise<ReadResultOk | { ok: false; error: { reason: string; path: string } }>
  applyEdits: (writes: FileWrite[]) => Promise<ApplyEditsResult>
}

function getBridge(): CanvFsApplyEditsBridge {
  const g = globalThis as unknown as { canvFS?: CanvFsApplyEditsBridge }
  if (!g.canvFS) throw new Error('canvFS bridge unavailable')
  return g.canvFS
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) return count
    count += 1
    from = idx + needle.length
  }
}

export async function applyEdits(edits: AnchorEdit[], deps: ApplyEditsDeps): Promise<ApplyEditsResult> {
  // 1. Group by path, preserving declaration order within a path.
  const byPath = new Map<string, AnchorEdit[]>()
  for (const e of edits) {
    const arr = byPath.get(e.path) ?? []
    arr.push(e)
    byPath.set(e.path, arr)
  }

  // 2. Refuse if any target path is dirty (would clobber the user's unsaved buffer).
  for (const p of byPath.keys()) {
    if (deps.isDirty(p)) {
      return { ok: false, error: { reason: 'file-dirty', path: p } }
    }
  }

  // 3. Read each file once; apply edits in declaration order to the in-memory copy.
  const bridge = getBridge()
  const fileWrites: FileWrite[] = []
  for (const [p, fileEdits] of byPath) {
    const r = await bridge.readFile(p)
    if (!r.ok) {
      return { ok: false, error: { reason: 'file-not-found', path: p } }
    }
    let content = r.content
    let expectedMtime: number | undefined = r.mtimeMs
    for (const edit of fileEdits) {
      if (edit.expectedMtimeMs != null) expectedMtime = edit.expectedMtimeMs
      const count = countOccurrences(content, edit.oldText)
      if (count === 0) return { ok: false, error: { reason: 'anchor-not-found', path: p } }
      if (count > 1) return { ok: false, error: { reason: 'anchor-not-unique', path: p, matches: count } }
      const idx = content.indexOf(edit.oldText)
      content = content.slice(0, idx) + edit.newText + content.slice(idx + edit.oldText.length)
    }
    fileWrites.push({
      path: p,
      newContent: content,
      expectedMtimeMs: expectedMtime,
      opts: { eol: r.eol, bom: r.bom },
    })
  }

  // 4. Forward to main. Atomicity contract lives there.
  return bridge.applyEdits(fileWrites)
}
