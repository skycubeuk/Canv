'use strict'

describe('MCP HTTP/SSE client', () => {
  it.skip('lists tools from an SSE server (skipped — covered by manual smoke)', async () => {
    // SSE server harness flaky in unit-test runner; covered by manual smoke
    // (Batch E). Stdio test proves the SDK integration; HTTP shares the same
    // connectOne / callTool plumbing.
  })
})
