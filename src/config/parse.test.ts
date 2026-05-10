import { describe, it, expect } from 'vitest'
import { parseModeFiles } from './parse'

const valid = (overrides = ''): string => `
id: fiction
label: Fiction
icon: BookOpen
description: Stories.
examples: Novels
order: 10
default: true
chatSystemPrompt: |
  You are a fiction editor.
actions:
  - id: grammar
    label: Grammar
    icon: PencilLine
    group: core
    inputMode: selection
    outputMode: replacement
    prompt: |
      Edit this text.
      {{text}}
${overrides}
`.trimStart()

describe('parseModeFiles — happy path', () => {
  it('parses a single valid mode file', () => {
    const result = parseModeFiles([{ file: 'fiction.yaml', content: valid() }])
    if (!result.ok) throw new Error('expected ok, got: ' + JSON.stringify(result.errors))
    expect(result.modes).toHaveLength(1)
    expect(result.modes[0].id).toBe('fiction')
    expect(result.modes[0].actions).toHaveLength(1)
    expect(result.modes[0].actions[0].id).toBe('grammar')
    // icon resolved to a component, not a string
    expect(typeof result.modes[0].icon).toBe('object')
    expect(typeof result.modes[0].actions[0].icon).toBe('object')
  })

  it('sorts modes by order then by id', () => {
    const a = valid().replace('id: fiction', 'id: a-mode').replace('order: 10', 'order: 20').replace('default: true', 'default: false')
    const b = valid().replace('id: fiction', 'id: b-mode').replace('order: 10', 'order: 10')
    const result = parseModeFiles([
      { file: 'a.yaml', content: a },
      { file: 'b.yaml', content: b },
    ])
    if (!result.ok) throw new Error('expected ok')
    expect(result.modes.map((m) => m.id)).toEqual(['b-mode', 'a-mode'])
  })

  it('preserves action ordering within a mode', () => {
    const yml = `
id: m
label: M
icon: BookOpen
description: d
examples: e
order: 1
default: true
chatSystemPrompt: |
  hi
actions:
  - { id: a, label: A, icon: BookOpen, group: core, inputMode: selection, outputMode: replacement, prompt: "{{text}}" }
  - { id: b, label: B, icon: BookOpen, group: core, inputMode: selection, outputMode: replacement, prompt: "{{text}}" }
  - { id: c, label: C, icon: BookOpen, group: core, inputMode: selection, outputMode: replacement, prompt: "{{text}}" }
`.trimStart()
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (!result.ok) throw new Error('expected ok')
    expect(result.modes[0].actions.map((a) => a.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('parseModeFiles — per-file validation', () => {
  it('reports invalid YAML with file-level error', () => {
    const result = parseModeFiles([{ file: 'broken.yaml', content: ': : not yaml' }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors[0].file).toBe('broken.yaml')
    expect(result.errors[0].field).toBe('')
    expect(result.errors[0].message).toMatch(/yaml/i)
  })

  it('reports a missing required field', () => {
    const yml = valid().replace('label: Fiction\n', '')
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({ file: 'm.yaml', field: 'label' }),
    )
  })

  it('reports a bad enum value for outputMode', () => {
    const yml = valid().replace('outputMode: replacement', 'outputMode: nonsense')
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: 'm.yaml',
        field: 'actions[0].outputMode',
        message: expect.stringContaining('replacement'),
      }),
    )
  })

  it('reports an unknown icon with did-you-mean suggestion', () => {
    const yml = valid().replace('icon: BookOpen', 'icon: BookOpe')
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    const err = result.errors.find((e) => e.field === 'icon')
    expect(err).toBeDefined()
    expect(err!.message).toContain('BookOpen')
    expect(err!.message).toContain('did you mean')
  })

  it('reports an action missing the {{text}} placeholder', () => {
    const yml = valid().replace('Edit this text.\n      {{text}}', 'No placeholder.')
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: 'm.yaml',
        field: 'actions[0].prompt',
        message: expect.stringContaining('{{text}}'),
      }),
    )
  })

  it('rejects a mode id that violates the regex', () => {
    const yml = valid().replace('id: fiction', 'id: Fiction!')
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({ file: 'm.yaml', field: 'id' }),
    )
  })

  it('rejects needsInstruction true without instructionPlaceholder', () => {
    const yml = valid().replace(
      "    prompt: |\n      Edit this text.\n      {{text}}",
      "    needsInstruction: true\n    prompt: |\n      {{instruction}}\n      {{text}}",
    )
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({ file: 'm.yaml', field: 'actions[0].instructionPlaceholder' }),
    )
  })

  it('rejects needsInstruction true without {{instruction}} in prompt', () => {
    const yml = valid().replace(
      "    prompt: |\n      Edit this text.\n      {{text}}",
      "    needsInstruction: true\n    instructionPlaceholder: hi\n    prompt: |\n      {{text}}",
    )
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: 'm.yaml',
        field: 'actions[0].prompt',
        message: expect.stringContaining('{{instruction}}'),
      }),
    )
  })

  it('rejects an empty actions array', () => {
    const yml = valid().split('actions:')[0] + 'actions: []\n'
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors[0].field).toBe('actions')
  })

  it('rejects a feedback-and-rewrite prompt missing the CORRECTED/SUGGESTED REWRITE header', () => {
    // valid() uses outputMode: replacement; switch it and strip the headers
    const yml = valid()
      .replace('outputMode: replacement', 'outputMode: feedback-and-rewrite')
      .replace(
        '    prompt: |\n      Edit this text.\n      {{text}}',
        '    prompt: |\n      ISSUES:\n      - check this\n\n      Now {{text}}',
      )
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: 'm.yaml',
        field: 'actions[0].prompt',
        message: expect.stringMatching(/CORRECTED|SUGGESTED REWRITE/),
      }),
    )
  })

  it('rejects a feedback-and-rewrite prompt missing the ISSUES/NOTES header', () => {
    const yml = valid()
      .replace('outputMode: replacement', 'outputMode: feedback-and-rewrite')
      .replace(
        '    prompt: |\n      Edit this text.\n      {{text}}',
        '    prompt: |\n      Just edit this:\n\n      CORRECTED:\n      {{text}}',
      )
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: 'm.yaml',
        field: 'actions[0].prompt',
        message: expect.stringMatching(/ISSUES|NOTES/),
      }),
    )
  })

  it('rejects a feedback-only prompt missing the NOTES header', () => {
    const yml = valid()
      .replace('outputMode: replacement', 'outputMode: feedback-only')
      .replace(
        '    prompt: |\n      Edit this text.\n      {{text}}',
        '    prompt: |\n      Just react to this:\n      {{text}}',
      )
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: 'm.yaml',
        field: 'actions[0].prompt',
        message: expect.stringContaining('NOTES'),
      }),
    )
  })

  it('accepts ISSUES (not NOTES) as the feedback header', () => {
    const yml = valid()
      .replace('outputMode: replacement', 'outputMode: feedback-and-rewrite')
      .replace(
        '    prompt: |\n      Edit this text.\n      {{text}}',
        '    prompt: |\n      ISSUES:\n      - thing\n\n      CORRECTED:\n      {{text}}',
      )
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (!result.ok) throw new Error('expected ok, got: ' + JSON.stringify(result.errors))
  })

  it('accepts SUGGESTED REWRITE (not CORRECTED) as the rewrite header', () => {
    const yml = valid()
      .replace('outputMode: replacement', 'outputMode: feedback-and-rewrite')
      .replace(
        '    prompt: |\n      Edit this text.\n      {{text}}',
        '    prompt: |\n      NOTES:\n      - thing\n\n      SUGGESTED REWRITE:\n      {{text}}',
      )
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (!result.ok) throw new Error('expected ok, got: ' + JSON.stringify(result.errors))
  })
})

describe('parseModeFiles — cross-file validation', () => {
  const baseFiction = valid()
  const baseFactual = valid().replace('id: fiction', 'id: factual').replace('default: true', 'default: false').replace('order: 10', 'order: 20')

  it('errors when no mode is marked default', () => {
    const fiction = valid().replace('default: true', 'default: false')
    const result = parseModeFiles([
      { file: 'fiction.yaml', content: fiction },
      { file: 'factual.yaml', content: baseFactual },
    ])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({ file: '', message: expect.stringContaining('exactly one') }),
    )
  })

  it('errors when more than one mode is marked default', () => {
    const factual = baseFactual.replace('default: false', 'default: true')
    const result = parseModeFiles([
      { file: 'fiction.yaml', content: baseFiction },
      { file: 'factual.yaml', content: factual },
    ])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({ file: '', message: expect.stringMatching(/two|exactly one/i) }),
    )
  })

  it('errors when two files share a mode id', () => {
    const result = parseModeFiles([
      { file: 'a.yaml', content: baseFiction },
      { file: 'b.yaml', content: baseFiction.replace('default: true', 'default: false').replace('order: 10', 'order: 20') },
    ])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({ file: '', message: expect.stringContaining('duplicate') }),
    )
  })

  it('errors when two actions in the same file share an id', () => {
    const yml = `
id: m
label: M
icon: BookOpen
description: d
examples: e
order: 1
default: true
chatSystemPrompt: |
  hi
actions:
  - { id: a, label: A, icon: BookOpen, group: core, inputMode: selection, outputMode: replacement, prompt: "{{text}}" }
  - { id: a, label: A2, icon: BookOpen, group: core, inputMode: selection, outputMode: replacement, prompt: "{{text}}" }
`.trimStart()
    const result = parseModeFiles([{ file: 'm.yaml', content: yml }])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: 'm.yaml',
        field: 'actions',
        message: expect.stringContaining('duplicate'),
      }),
    )
  })

  it('does not error when two files have actions sharing an id (per-mode scope)', () => {
    const a = valid().replace('id: fiction', 'id: a-mode')
    const b = valid().replace('id: fiction', 'id: b-mode').replace('default: true', 'default: false').replace('order: 10', 'order: 20')
    const result = parseModeFiles([
      { file: 'a.yaml', content: a },
      { file: 'b.yaml', content: b },
    ])
    if (!result.ok) throw new Error('expected ok, got: ' + JSON.stringify(result.errors))
    expect(result.modes).toHaveLength(2)
  })

  it('reports errors from all files, not just the first', () => {
    const a = valid().replace('icon: BookOpen', 'icon: NopeNope1')
    const b = baseFactual.replace('icon: BookOpen', 'icon: NopeNope2')
    const result = parseModeFiles([
      { file: 'a.yaml', content: a },
      { file: 'b.yaml', content: b },
    ])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors.some((e) => e.file === 'a.yaml')).toBe(true)
    expect(result.errors.some((e) => e.file === 'b.yaml')).toBe(true)
  })

  it('errors when no mode files are provided at all', () => {
    const result = parseModeFiles([])
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        file: '',
        message: expect.stringMatching(/no mode files/i),
      }),
    )
  })
})
