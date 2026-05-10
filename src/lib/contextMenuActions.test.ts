import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cutFromTextarea,
  copyFromTextarea,
  pasteIntoTextarea,
  selectAllInTextarea,
  copyFromDom,
  selectAllInDom,
} from './contextMenuActions'

function makeTextarea(value = 'hello world', start = 0, end = 5): HTMLTextAreaElement {
  document.body.innerHTML = '<textarea></textarea>'
  const el = document.body.querySelector('textarea')!
  el.value = value
  el.focus()
  el.setSelectionRange(start, end)
  return el
}

describe('contextMenuActions — textarea helpers', () => {
  // execCommand is deprecated and not in DOM lib typings; cast through to mock it.
  let execSpy: ReturnType<typeof vi.fn>
  let writeText: ReturnType<typeof vi.fn>
  let readText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    execSpy = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: execSpy,
    })
    writeText = vi.fn().mockResolvedValue(undefined)
    readText = vi.fn().mockResolvedValue('PASTED')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText, readText },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cutFromTextarea calls document.execCommand("cut")', async () => {
    const el = makeTextarea()
    await cutFromTextarea(el)
    expect(execSpy).toHaveBeenCalledWith('cut')
  })

  it('copyFromTextarea calls document.execCommand("copy")', async () => {
    const el = makeTextarea()
    await copyFromTextarea(el)
    expect(execSpy).toHaveBeenCalledWith('copy')
  })

  it('pasteIntoTextarea inserts clipboard text at the selection and dispatches input', async () => {
    const el = makeTextarea('abcdef', 1, 3)
    let inputFired = false
    el.addEventListener('input', () => { inputFired = true })
    await pasteIntoTextarea(el)
    expect(el.value).toBe('aPASTEDdef')
    expect(inputFired).toBe(true)
  })

  it('selectAllInTextarea selects the full value', () => {
    const el = makeTextarea('abc', 0, 0)
    selectAllInTextarea(el)
    expect(el.selectionStart).toBe(0)
    expect(el.selectionEnd).toBe(3)
  })

  it('helpers swallow clipboard errors silently', async () => {
    const el = makeTextarea()
    readText.mockRejectedValueOnce(new Error('denied'))
    await expect(pasteIntoTextarea(el)).resolves.toBeUndefined()
  })
})

describe('contextMenuActions — DOM helpers', () => {
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })

  it('copyFromDom writes the current selection text to the clipboard', async () => {
    document.body.innerHTML = '<div id="src">hello</div>'
    const root = document.getElementById('src')!
    const sel = window.getSelection()!
    sel.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(root)
    sel.addRange(range)
    await copyFromDom()
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('selectAllInDom selects the contents of the given root', () => {
    document.body.innerHTML = '<div id="src">target</div><div>other</div>'
    const root = document.getElementById('src')!
    selectAllInDom(root)
    expect(window.getSelection()?.toString()).toBe('target')
  })
})
