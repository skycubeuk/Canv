import { describe, it, expect } from 'vitest'
import { buildTranscriptMarkdown } from './buildTranscript'

describe('buildTranscriptMarkdown', () => {
  it('includes session id, errors, and the system prompt', () => {
    const md = buildTranscriptMarkdown({
      sessionId: 'abc12345',
      systemPrompt: 'You are the Canv Extension Builder.',
      history: [
        { role: 'user', content: 'build me a word counter' },
      ],
      errors: ['manifest.contributions[0].type missing'],
    })
    expect(md).toContain('abc12345')
    expect(md).toContain('Latest errors')
    expect(md).toContain('manifest.contributions[0].type missing')
    expect(md).toContain('System prompt')
    expect(md).toContain('You are the Canv Extension Builder.')
    expect(md).toContain('Turn 1 — User')
    expect(md).toContain('build me a word counter')
  })

  it('renders assistant payloads as parsed JSON and lists the files', () => {
    const payload = JSON.stringify({
      manifest: { id: 'wc', name: 'Word Count', version: '1.0.0' },
      files: { 'panels/main.html': '<p>x</p>', 'panels/main.js': 'console.log(1)' },
    })
    const md = buildTranscriptMarkdown({
      sessionId: 's',
      history: [
        { role: 'assistant', content: payload },
      ],
      errors: [],
    })
    expect(md).toContain('Parsed as a manifest payload')
    expect(md).toContain('"name": "Word Count"')
    expect(md).toContain('Files in the latest payload')
    expect(md).toContain('panels/main.html')
    expect(md).toContain('<p>x</p>')
    expect(md).toContain('panels/main.js')
  })

  it('falls back to raw text when an assistant message is not JSON', () => {
    const md = buildTranscriptMarkdown({
      sessionId: 's',
      history: [{ role: 'assistant', content: 'sorry I cannot help with that' }],
      errors: [],
    })
    expect(md).toContain('Did not parse as a manifest payload')
    expect(md).toContain('sorry I cannot help with that')
  })

  it('reports "no manifest yet" status when there is no manifest and no errors', () => {
    const md = buildTranscriptMarkdown({ sessionId: 's', history: [], errors: [] })
    expect(md).toContain('no manifest yet')
    expect(md).toContain('_No messages._')
  })

  it('includes manifest summary when present', () => {
    const md = buildTranscriptMarkdown({
      sessionId: 's',
      history: [],
      errors: [],
      manifest: { name: 'X', version: '1.2.3', capabilities: ['ui'], network: ['api.example.com'] },
    })
    expect(md).toContain('Active manifest')
    expect(md).toContain('Name:** X v1.2.3')
    expect(md).toContain('Capabilities:** ui')
    expect(md).toContain('api.example.com')
  })
})
