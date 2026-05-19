const { loadSystemPrompt } = require('./system-prompt.cjs')

describe('extensionBuilder.system.md', () => {
  const prompt = loadSystemPrompt()

  it('loads the prompt file', () => {
    expect(prompt.length).toBeGreaterThan(500)
    expect(prompt.length).toBeLessThan(5000)
  })

  it('mentions the JSON output schema', () => {
    expect(prompt).toMatch(/manifest/i)
    expect(prompt).toMatch(/files/i)
    expect(prompt).toMatch(/json/i)
  })

  it('instructs to call learn_* tools for detailed docs', () => {
    expect(prompt).toMatch(/learn_/i)
    expect(prompt).toMatch(/learn_panel/i)
    expect(prompt).toMatch(/learn_command/i)
    expect(prompt).toMatch(/learn_manifest_full/i)
  })

  it('teaches the visual consistency contract', () => {
    expect(prompt).toMatch(/--canv-/)
    expect(prompt).toMatch(/<canv-icon/)
    expect(prompt).toMatch(/canv-ui\.css/)
  })

  it('warns against emoji in chrome', () => {
    expect(prompt).toMatch(/emoji/i)
  })

  it('mentions capability declaration discipline', () => {
    expect(prompt).toMatch(/capability/i)
    expect(prompt).toMatch(/declare/i)
  })

  it('mentions multiple contribution types as available', () => {
    expect(prompt).toMatch(/panel/)
    expect(prompt).toMatch(/command/)
    expect(prompt).toMatch(/fileHandler|menu|statusBar|language/)
  })
})
