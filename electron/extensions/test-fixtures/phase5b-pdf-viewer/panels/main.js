async function showCurrent() {
  try {
    const bytes = await canv.activeDoc.getBytes()
    const root = document.getElementById('root')
    if (root) root.textContent = `Opened a file with ${bytes.byteLength ?? bytes.length} bytes.`
  } catch (e) {
    const root = document.getElementById('root')
    if (root) root.textContent = 'Error: ' + (e && e.message ? e.message : String(e))
  }
}
canv.lifecycle.onActivate(showCurrent)
canv.events.on('activeFile.changed', showCurrent)
