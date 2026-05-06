type Editable = HTMLTextAreaElement | HTMLInputElement

async function safe<T>(fn: () => Promise<T> | T): Promise<T | undefined> {
  try { return await fn() } catch { return undefined }
}

export async function cutFromTextarea(el: Editable): Promise<void> {
  el.focus()
  await safe(() => { document.execCommand('cut') })
}

export async function copyFromTextarea(el: Editable): Promise<void> {
  el.focus()
  await safe(() => { document.execCommand('copy') })
}

export async function pasteIntoTextarea(el: Editable): Promise<void> {
  el.focus()
  const text = await safe(() => navigator.clipboard.readText())
  if (text == null) return
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  if (typeof el.setRangeText === 'function') {
    el.setRangeText(text, start, end, 'end')
  } else {
    el.value = el.value.slice(0, start) + text + el.value.slice(end)
    const cursor = start + text.length
    el.setSelectionRange(cursor, cursor)
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function selectAllInTextarea(el: Editable): void {
  el.focus()
  el.select()
}

export async function copyFromDom(): Promise<void> {
  const text = window.getSelection()?.toString() ?? ''
  await safe(() => navigator.clipboard.writeText(text))
}

export function selectAllInDom(rootEl: HTMLElement): void {
  const sel = window.getSelection()
  if (!sel) return
  sel.removeAllRanges()
  const range = document.createRange()
  range.selectNodeContents(rootEl)
  sel.addRange(range)
}
