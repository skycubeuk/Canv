const { effectiveActivationEvents, shouldActivateFor } = require('./activation-events.cjs')

describe('effectiveActivationEvents', () => {
  it('returns explicit activationEvents if present', () => {
    const m = {
      activationEvents: ['onStartup'],
      contributions: [{ type: 'panel', id: 'main', location: 'right-sidebar' }],
    }
    expect(effectiveActivationEvents(m)).toEqual(['onStartup'])
  })
  it('infers onPanelOpen from each panel contribution when none declared', () => {
    const m = {
      contributions: [
        { type: 'panel', id: 'main', location: 'right-sidebar' },
        { type: 'panel', id: 'side', location: 'left-sidebar' },
      ],
    }
    expect(effectiveActivationEvents(m).sort()).toEqual([
      'onPanelOpen:left-sidebar:side',
      'onPanelOpen:right-sidebar:main',
    ])
  })
  it('returns [] when no events declared and no panel contributions', () => {
    expect(effectiveActivationEvents({ contributions: [] })).toEqual([])
  })
})

describe('shouldActivateFor', () => {
  it('matches onStartup trigger', () => {
    expect(shouldActivateFor({ activationEvents: ['onStartup'] }, { kind: 'startup' })).toBe(true)
    expect(shouldActivateFor({ activationEvents: ['onPanelOpen:x:y'] }, { kind: 'startup' })).toBe(false)
  })
  it('matches onPanelOpen trigger by location + id', () => {
    const m = { activationEvents: ['onPanelOpen:right-sidebar:main'] }
    expect(shouldActivateFor(m, { kind: 'panelOpen', location: 'right-sidebar', panelId: 'main' })).toBe(true)
    expect(shouldActivateFor(m, { kind: 'panelOpen', location: 'right-sidebar', panelId: 'other' })).toBe(false)
    expect(shouldActivateFor(m, { kind: 'panelOpen', location: 'left-sidebar', panelId: 'main' })).toBe(false)
  })
  it('matches onCommand trigger', () => {
    const m = { activationEvents: ['onCommand:wordCount.refresh'] }
    expect(shouldActivateFor(m, { kind: 'command', commandId: 'wordCount.refresh' })).toBe(true)
    expect(shouldActivateFor(m, { kind: 'command', commandId: 'other.thing' })).toBe(false)
  })
  it('matches via inferred events when activationEvents is empty', () => {
    const m = { activationEvents: [], contributions: [{ type: 'panel', id: 'p', location: 'bottom-dock' }] }
    expect(shouldActivateFor(m, { kind: 'panelOpen', location: 'bottom-dock', panelId: 'p' })).toBe(true)
  })
})
