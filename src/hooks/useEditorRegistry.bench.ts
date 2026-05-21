/**
 * Keystroke pipeline benchmark.
 *
 * Measures the cost of a single editor keystroke through the Canv live-docs
 * channel: a CodeMirror transaction (apply a change), then a
 * `liveDocsChannel.publish(key)`, then a subscriber pulling the current
 * doc text via the registered getter (`channel.read(key)`).
 *
 * The doc is ~2 MB of deterministic markdown so the bench reflects a
 * worst-case "large notebook" workload rather than a trivial in-memory
 * string. We deliberately use the headless `EditorState` (not `EditorView`)
 * so the bench is environment-agnostic — `EditorView` requires a real DOM
 * container which jsdom can host but adds layout/paint cost orthogonal to
 * the notification path we want to measure.
 *
 * Treat the printed p99 as a regression baseline for the live-doc
 * notification pipeline.
 *
 * Note on drift: `state` is mutated across iterations (each `update` returns
 * a new state which we reassign), so the doc grows by one char per call —
 * ~1.1 KB over ~1,100 samples on a 2 MB base. That's a ≤0.05% size drift,
 * immaterial vs. the noise floor of the measurement, so we don't reset
 * state per-iteration.
 */
import { bench, describe } from 'vitest'
import { EditorState } from '@codemirror/state'
import { createLiveDocsChannel } from './useFocusedDocText'

function makeDoc(targetBytes: number): string {
  const line = 'The quick brown fox jumps over the lazy dog. '
  const lines = Math.ceil(targetBytes / line.length)
  return Array.from({ length: lines }, () => line).join('\n')
}

describe('live-buffer keystroke pipeline — 2 MB doc', () => {
  const doc = makeDoc(2 * 1024 * 1024)
  const channel = createLiveDocsChannel()
  let state = EditorState.create({ doc })
  // Subscriber-pulled sink — registered getter returns the live state's doc.
  channel.setGetter((_key: string) => state.doc.toString())
  let sink: string | undefined
  channel.subscribe((key: string) => {
    sink = channel.read(key)
    void sink
  })

  bench(
    'EditorState.update insert -> channel.publish -> subscriber pulls read()',
    () => {
      const tr = state.update({ changes: { from: 0, insert: 'x' } })
      state = tr.state
      channel.publish('bench:key')
    },
    { iterations: 1000, warmupIterations: 100 },
  )
})
