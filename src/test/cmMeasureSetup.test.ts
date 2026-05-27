import { describe, it, expect } from 'vitest'

// Regression guard for the jsdom layout polyfill in src/test/setup.ts.
// @codemirror/view's clientRectsFor() does textRange(textNode, 0, len)
// .getClientRects() (node_modules/@codemirror/view/dist/index.js:464). jsdom
// ships no layout engine, so without the polyfill Range.prototype.getClientRects
// is undefined -> TypeError, which escapes the rAF-scheduled measure as an
// unhandled error and fails the whole run — observed only on the Windows CI
// runner. If this test fails, the polyfill is gone and Windows CI will break.
describe('jsdom Range.getClientRects (codemirror measure path)', () => {
  it('a Range over a text node exposes getClientRects()', () => {
    const p = document.createElement('p')
    p.textContent = 'the cat sat'
    document.body.appendChild(p)
    const range = document.createRange()
    const textNode = p.firstChild!
    range.setStart(textNode, 0)
    range.setEnd(textNode, textNode.textContent!.length)
    expect(typeof range.getClientRects).toBe('function')
    expect(() => range.getClientRects()).not.toThrow()
    p.remove()
  })
})
