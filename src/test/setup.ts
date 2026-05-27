import '@testing-library/jest-dom/vitest'

// jsdom ships no layout engine, so Range.prototype.getClientRects /
// getBoundingClientRect are not implemented. @codemirror/view's measure phase
// (clientRectsFor -> textRange(node).getClientRects()) calls getClientRects on
// a text node, throwing "getClientRects is not a function". That throw escapes
// the requestAnimationFrame-scheduled measure as an unhandled error and fails
// the whole run — observed only on the Windows CI runner, where timing lets the
// rAF fire before the editor is torn down. Stub the two APIs with empty results
// so CodeMirror's measure path is a harmless no-op under jsdom.
if (typeof Range !== 'undefined') {
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = function getClientRects(): DOMRectList {
      const list = {
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      }
      return list as unknown as DOMRectList
    }
  }
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
        toJSON: () => ({}),
      }
    }
  }
}
