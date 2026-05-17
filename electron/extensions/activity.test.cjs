const activity = require('./activity.cjs')

describe('activity counters', () => {
  beforeEach(() => activity._resetAllForTest())

  it('starts with zero counters for unknown extension', () => {
    expect(activity.get('x')).toEqual({ tokensIn: 0, tokensOut: 0, netRequests: 0 })
  })
  it('recordAi accumulates token counts', () => {
    activity.recordAi('x', { in: 10, out: 5 })
    activity.recordAi('x', { in: 3, out: 2 })
    expect(activity.get('x')).toEqual({ tokensIn: 13, tokensOut: 7, netRequests: 0 })
  })
  it('recordAi tolerates missing usage fields', () => {
    activity.recordAi('x', undefined)
    activity.recordAi('x', {})
    activity.recordAi('x', { in: 1 })
    expect(activity.get('x')).toEqual({ tokensIn: 1, tokensOut: 0, netRequests: 0 })
  })
  it('recordNet increments per-extension count', () => {
    activity.recordNet('x'); activity.recordNet('x'); activity.recordNet('y')
    expect(activity.get('x').netRequests).toBe(2)
    expect(activity.get('y').netRequests).toBe(1)
  })
  it('reset clears one extension without affecting others', () => {
    activity.recordAi('x', { in: 5, out: 5 })
    activity.recordAi('y', { in: 5, out: 5 })
    activity.reset('x')
    expect(activity.get('x')).toEqual({ tokensIn: 0, tokensOut: 0, netRequests: 0 })
    expect(activity.get('y')).toEqual({ tokensIn: 5, tokensOut: 5, netRequests: 0 })
  })
})
