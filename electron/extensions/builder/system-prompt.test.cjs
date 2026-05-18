const { loadSystemPrompt } = require('./system-prompt.cjs')

describe('extensionBuilder.system.md', () => {
  const prompt = loadSystemPrompt()

  it('loads the prompt file', () => {
    expect(prompt.length).toBeGreaterThan(2000)
    expect(prompt.length).toBeLessThan(20000)
  })

  it('mentions the JSON output schema', () => {
    expect(prompt).toMatch(/manifest/i)
    expect(prompt).toMatch(/files/i)
    expect(prompt).toMatch(/json/i)
  })

  it('teaches the canv.* API surface', () => {
    expect(prompt).toMatch(/canv\.activeDoc/)
    expect(prompt).toMatch(/canv\.ai\.ask/)
    expect(prompt).toMatch(/canv\.net\.fetch/)
    expect(prompt).toMatch(/canv\.ui\.quickPick/)
    expect(prompt).toMatch(/canv\.settings/)
    expect(prompt).toMatch(/canv\.storage/)
  })

  it('teaches the visual consistency contract', () => {
    expect(prompt).toMatch(/--canv-/)
    expect(prompt).toMatch(/<canv-icon/)
    expect(prompt).toMatch(/canv-ui\.css/)
  })

  it('lists the available icon names', () => {
    expect(prompt).toMatch(/bar-chart/)
    expect(prompt).toMatch(/info/)
    expect(prompt).toMatch(/refresh-cw/)
  })

  it('warns against emoji in chrome', () => {
    expect(prompt).toMatch(/emoji/i)
  })

  it('mentions capability declaration discipline', () => {
    expect(prompt).toMatch(/activeDoc\.read/)
    expect(prompt).toMatch(/declare/i)
  })

  it('states Phase 4 supports only the panel contribution', () => {
    expect(prompt).toMatch(/panel/)
    expect(prompt).toMatch(/fileHandler|command|language|menu|statusBar/)  // mentions what NOT to use
  })
})
