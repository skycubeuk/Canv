async function refresh() {
  const text = await canv.activeDoc.getText().catch(() => '')
  const wc = (text.trim() ? text.trim().split(/\s+/).length : 0)
  await canv.ui.setStatusBarItem('wc', {
    text: `P5a: ${wc} words`,
    tooltip: `Word count as of ${new Date().toLocaleTimeString()}`,
  })
}

canv.commands.onInvoke((commandId) => {
  if (commandId === 'p5a.refresh') refresh()
})

canv.events.on('activeDocChanged', () => refresh())
canv.lifecycle.onActivate(() => refresh())
