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

describe('Phase 5 effective events inference', () => {
  it('infers onFileType:.<ext> from each fileHandler', () => {
    const m = { contributions: [
      { type: 'fileHandler', id: 'pdf', extensions: ['.pdf', '.epub'], mode: 'viewer' },
    ] }
    expect(effectiveActivationEvents(m).sort()).toEqual([
      'onFileType:.epub',
      'onFileType:.pdf',
    ])
  })
  it('infers onLanguage:.<ext> from each language contribution', () => {
    const m = { contributions: [
      { type: 'language', extensions: ['.tex', '.bib'] },
    ] }
    expect(effectiveActivationEvents(m).sort()).toEqual([
      'onLanguage:.bib',
      'onLanguage:.tex',
    ])
  })
  it('infers onStatusBarRender for extensions with statusBar contributions', () => {
    const m = { contributions: [{ type: 'statusBar', id: 'x', alignment: 'right', priority: 10 }] }
    expect(effectiveActivationEvents(m)).toEqual(['onStatusBarRender'])
  })
  it('infers onCommand:<id> for each command contribution', () => {
    const m = { contributions: [
      { type: 'command', id: 'foo.bar', title: 'X', entry: 'x.html' },
      { type: 'command', id: 'baz.qux', title: 'Y', entry: 'y.html' },
    ] }
    expect(effectiveActivationEvents(m).sort()).toEqual(['onCommand:baz.qux', 'onCommand:foo.bar'])
  })
  it('infers onMenuOpen:<menu> for each unique menu surface', () => {
    const m = { contributions: [
      { type: 'menu', menu: 'fileTree.context', command: 'x.y' },
      { type: 'menu', menu: 'fileTree.context', command: 'a.b' },
    ] }
    expect(effectiveActivationEvents(m)).toEqual(['onMenuOpen:fileTree.context'])
  })
})

describe('Phase 5 shouldActivateFor trigger matching', () => {
  it('matches onFileType trigger', () => {
    const m = { activationEvents: ['onFileType:.pdf'] }
    expect(shouldActivateFor(m, { kind: 'fileType', ext: '.pdf' })).toBe(true)
    expect(shouldActivateFor(m, { kind: 'fileType', ext: '.md' })).toBe(false)
  })
  it('matches onLanguage trigger', () => {
    const m = { activationEvents: ['onLanguage:.tex'] }
    expect(shouldActivateFor(m, { kind: 'language', ext: '.tex' })).toBe(true)
    expect(shouldActivateFor(m, { kind: 'language', ext: '.bib' })).toBe(false)
  })
  it('matches onStatusBarRender trigger', () => {
    const m = { activationEvents: ['onStatusBarRender'] }
    expect(shouldActivateFor(m, { kind: 'statusBarRender' })).toBe(true)
  })
  it('matches onMenuOpen trigger', () => {
    const m = { activationEvents: ['onMenuOpen:fileTree.context'] }
    expect(shouldActivateFor(m, { kind: 'menuOpen', menu: 'fileTree.context' })).toBe(true)
    expect(shouldActivateFor(m, { kind: 'menuOpen', menu: 'other' })).toBe(false)
  })
})
