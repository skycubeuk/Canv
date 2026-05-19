canv.commands.onInvoke(async (commandId, args) => {
  if (commandId !== 'md.count.file') return
  const rel = Array.isArray(args) ? args[0] : null
  if (!rel) { await canv.ui.notify('No file path supplied', 'warning'); return }
  try {
    const text = await canv.workspace.readText(rel)
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    await canv.ui.notify(`${rel}: ${words} words`, 'info')
  } catch (e) {
    await canv.ui.notify('Failed to read ' + rel + ': ' + (e && e.message ? e.message : String(e)), 'error')
  }
})
