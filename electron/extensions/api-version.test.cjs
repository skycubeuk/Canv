'use strict'
const semver = require('semver')
const { CANV_API_VERSION } = require('./api-version.cjs')

describe('CANV_API_VERSION', () => {
  it('is a valid semver string', () => {
    expect(semver.valid(CANV_API_VERSION)).not.toBeNull()
  })

  it('starts at 1.0.0', () => {
    expect(CANV_API_VERSION).toBe('1.0.0')
  })
})
