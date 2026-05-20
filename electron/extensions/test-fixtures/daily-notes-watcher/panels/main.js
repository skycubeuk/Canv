// Phase 3 smoke fixture for workspaceContains: activation.

const statusEl = document.getElementById('status')

function fmt(d) {
  return d.toLocaleTimeString() + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

canv.lifecycle.onActivate((ctx) => {
  const t = fmt(new Date())
  statusEl.textContent = `activated at ${t}\ntrigger: ${JSON.stringify(ctx, null, 2)}`
  void canv.ui.notify(`Daily Notes Watcher activated (${ctx?.reason ?? 'unknown'})`, 'info')
})

canv.lifecycle.onUnload((ctx) => {
  statusEl.textContent = `unloaded at ${fmt(new Date())}\n${JSON.stringify(ctx, null, 2)}`
})
