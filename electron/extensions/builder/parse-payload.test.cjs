const { parsePayload } = require('./parse-payload.cjs')

function validPayload(overrides = {}) {
  return {
    manifest: {
      id: 'hello',
      name: 'Hello',
      version: '1.0.0',
      capabilities: ['activeDoc.read'],
      contributions: [{
        type: 'panel', id: 'main', title: 'Hello',
        icon: 'info', location: 'right-sidebar', entry: 'panels/main.html',
      }],
    },
    files: {
      'panels/main.html': '<p>hi</p>',
    },
    ...overrides,
  }
}

describe('parsePayload', () => {
  it('parses clean JSON', () => {
    const r = parsePayload(JSON.stringify(validPayload()))
    expect(r.ok).toBe(true)
    expect(r.payload.manifest.id).toBe('hello')
    expect(r.payload.files['panels/main.html']).toBe('<p>hi</p>')
  })

  it('parses JSON wrapped in markdown ```json fence', () => {
    const wrapped = '```json\n' + JSON.stringify(validPayload()) + '\n```'
    const r = parsePayload(wrapped)
    expect(r.ok).toBe(true)
    expect(r.payload.manifest.id).toBe('hello')
  })

  it('parses JSON wrapped in plain ``` fence', () => {
    const wrapped = '```\n' + JSON.stringify(validPayload()) + '\n```'
    const r = parsePayload(wrapped)
    expect(r.ok).toBe(true)
  })

  it('parses JSON with leading/trailing whitespace + prose', () => {
    const wrapped = 'Sure, here you go:\n\n```json\n' + JSON.stringify(validPayload()) + '\n```\n\nLet me know if you want changes.'
    const r = parsePayload(wrapped)
    expect(r.ok).toBe(true)
  })

  it('fails when no JSON-looking content found', () => {
    const r = parsePayload('just some prose with no braces')
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/json/i)
  })

  it('fails when JSON is malformed', () => {
    const r = parsePayload('{ "manifest": { broken }')
    expect(r.ok).toBe(false)
  })

  it('fails when manifest field is missing', () => {
    const r = parsePayload(JSON.stringify({ files: {} }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/manifest/i)
  })

  it('fails when files field is missing', () => {
    const p = validPayload()
    const r = parsePayload(JSON.stringify({ manifest: p.manifest }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/files/i)
  })

  it('fails when manifest fails schema validation', () => {
    const p = validPayload({ manifest: { id: '../bad' } })
    const r = parsePayload(JSON.stringify(p))
    expect(r.ok).toBe(false)
  })

  it('fails when a contribution entry path is missing from files', () => {
    const p = validPayload()
    delete p.files['panels/main.html']
    p.files['other.html'] = '<p>x</p>'
    const r = parsePayload(JSON.stringify(p))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/panels\/main\.html|missing/i)
  })

  it('fails when files contains non-string values', () => {
    const p = validPayload()
    p.files['panels/main.html'] = 42
    const r = parsePayload(JSON.stringify(p))
    expect(r.ok).toBe(false)
  })
})
