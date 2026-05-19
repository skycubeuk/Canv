import { bench, describe } from 'vitest'
import { EditorState } from '@codemirror/state'

function makeDoc(targetBytes: number): string {
  const line = 'The quick brown fox jumps over the lazy dog. '
  const lines = Math.ceil(targetBytes / line.length)
  return Array.from({ length: lines }, () => line).join('\n')
}

describe('live-buffer keystroke pipeline', () => {
  const doc = makeDoc(2 * 1024 * 1024) // 2 MB

  bench(
    '1000 single-character inserts on 2MB doc',
    () => {
      let state = EditorState.create({ doc })
      for (let i = 0; i < 1000; i++) {
        const pos = (i * 1024) % state.doc.length
        const tr = state.update({ changes: { from: pos, insert: 'x' } })
        state = tr.state
        // Notification-only — subscribers pull text on demand via the registered
        // getter (the change in src/hooks/useFocusedDocText.ts that this bench
        // is the baseline for). Bench measures the pure CodeMirror transaction
        // cost without the dead-weight string mirror.
      }
    },
    { iterations: 5 },
  )
})
