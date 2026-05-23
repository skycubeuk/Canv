import { useCallback, useEffect, useRef, useState } from 'react'
import { McpServerConfigSchema, type McpServerConfig } from '../../../hooks/settingsSchema'
import type { McpToolSummary } from '../../../agents/mcp'

export type Status =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'connected'; tools: McpToolSummary[] }
  | { kind: 'failed'; error: string }

interface Result {
  status: Status
  retry: () => Promise<void>
}

function hashCfg(cfg: McpServerConfig): string {
  // Deterministic enough — the cfg shape is small and key order is stable here
  // (JS preserves string-key insertion order). The cfg only comes from the
  // schema-driven form, so the key order is predictable.
  return JSON.stringify(cfg)
}

function parseCfg(item: unknown): McpServerConfig | null {
  const r = McpServerConfigSchema.safeParse(item)
  return r.success ? r.data : null
}

/**
 * Per-row MCP server status hook.
 *
 * Lifecycle:
 *  - Boot test fires once on mount for a valid cfg. The effect deps are `[]`
 *    intentionally — we want one shot per mount, not re-fires when the outer
 *    row re-renders. StrictMode's double-mount in dev still works because
 *    `cancelledRef` flips during the cleanup of the first mount.
 *  - On row-collapse (subscribed via `onCollapsed`), re-test ONLY if the cfg
 *    hash changed since the last test — so a no-op collapse is free.
 *  - `retry()` always re-tests via `reconnectServer` (forces a fresh connect).
 *  - In-flight tests are cancelled on unmount via `cancelledRef` — no
 *    setState-after-unmount warnings.
 *
 * The hook reads the LATEST item via `latestItemRef` (updated each render),
 * so callbacks created early (boot effect, collapse listener, retry) all see
 * the freshest cfg — not a stale closure from the initial mount. That's
 * what makes "edit + collapse → test the EDITED cfg" work.
 */
export function useMcpServerStatus(
  item: unknown,
  onCollapsed: (cb: () => void) => () => void,
): Result {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const cancelledRef = useRef(false)
  // Track the config we've already tested so a collapse with unchanged hash
  // doesn't re-fire. Initialised to null so the boot effect always tests.
  const lastTestedHashRef = useRef<string | null>(null)
  // Stable reference to the latest item — used by callbacks that close over
  // it (collapse handler, retry). Updated synchronously each render.
  const latestItemRef = useRef<unknown>(item)
  // eslint-disable-next-line react-hooks/refs -- intentional latest-value ref; collapse/retry callbacks (created on mount with [] deps) must read the freshest item, so writing in an effect would lag by one render
  latestItemRef.current = item

  // Apply a test result. No-op if the component has unmounted mid-flight.
  const applyResult = useCallback(
    (
      r: { ok: true; tools: McpToolSummary[] } | { ok: false; error: string } | undefined,
      hash: string,
    ) => {
      if (cancelledRef.current) return
      if (!r) {
        setStatus({ kind: 'failed', error: 'MCP bridge unavailable' })
        return
      }
      if (r.ok) setStatus({ kind: 'connected', tools: r.tools })
      else setStatus({ kind: 'failed', error: r.error })
      lastTestedHashRef.current = hash
    },
    [],
  )

  // Fire a test against the CURRENT item (read via latestItemRef). Returns
  // the cfg that was tested (or null if invalid / no bridge).
  const runTest = useCallback(async (force: boolean): Promise<McpServerConfig | null> => {
    const cfg = parseCfg(latestItemRef.current)
    if (!cfg) return null
    const hash = hashCfg(cfg)
    if (!force && lastTestedHashRef.current === hash) return null
    setStatus({ kind: 'testing' })
    const r = await window.canvMcp?.testServer(cfg.name)
    applyResult(r, hash)
    return cfg
  }, [applyResult])

  const retry = useCallback(async () => {
    const cfg = parseCfg(latestItemRef.current)
    if (!cfg) return
    const hash = hashCfg(cfg)
    setStatus({ kind: 'testing' })
    const r = await window.canvMcp?.reconnectServer(cfg.name)
    applyResult(r, hash)
  }, [applyResult])

  // Boot test: fires once per mounted hook instance. The effect depends on
  // [] intentionally — we want one shot on mount, not re-fires when the
  // outer component re-renders.
  useEffect(() => {
    cancelledRef.current = false
    void runTest(false)
    return () => { cancelledRef.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Collapse subscription. Re-test when the row goes expanded → collapsed AND
  // the cfg has changed since the last test (the hash check inside runTest).
  useEffect(() => {
    const unsub = onCollapsed(() => { void runTest(false) })
    return unsub
  }, [onCollapsed, runTest])

  return { status, retry }
}
