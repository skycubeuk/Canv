'use strict'

const { MAX_OPEN_BYTES: cjsLimit } = require('./services/fs-limits.cjs')

describe('fs-limits sync', () => {
  it('main and renderer constants are equal', async () => {
    const { MAX_OPEN_BYTES: tsLimit } = await import('../src/lib/fs-limits.ts')
    expect(tsLimit).toBe(cjsLimit)
  })
})
