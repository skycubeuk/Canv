// electron/extensions/test-fixtures/hello-world/panels/main.js

async function refresh() {
  try { document.getElementById('ws-root').textContent = await canv.workspace.getRoot() }
  catch (e) { document.getElementById('ws-root').textContent = 'err: ' + e.message }

  try {
    const path = await canv.activeDoc.getPath()
    document.getElementById('active-path').textContent = path ?? '(no active doc)'
  } catch (e) { document.getElementById('active-path').textContent = 'err: ' + e.message }

  try {
    const text = await canv.activeDoc.getText()
    document.getElementById('active-text').textContent = (text || '').slice(0, 240) + ((text || '').length > 240 ? '…' : '')
  } catch (e) { document.getElementById('active-text').textContent = 'err: ' + e.message }

  try {
    const sel = await canv.activeDoc.getSelection()
    document.getElementById('active-sel').textContent = `sel ${sel.from}..${sel.to}: ${JSON.stringify(sel.text)}`
  } catch (e) { document.getElementById('active-sel').textContent = 'err: ' + e.message }
}

async function loadCounter() {
  const n = (await canv.storage.get('counter')) ?? 0
  document.getElementById('counter').textContent = String(n)
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]')
  if (!btn) return
  const action = btn.dataset.action
  try {
    if (action === 'list') {
      const tree = await canv.workspace.list(null)
      const out = document.getElementById('ws-list')
      out.hidden = false
      out.textContent = JSON.stringify(tree, null, 2).slice(0, 1200)
    } else if (action === 'insert') { await canv.activeDoc.insertAtCursor('XYZ'); refresh() }
      else if (action === 'replace') { await canv.activeDoc.replaceSelection('[replaced]'); refresh() }
      else if (action === 'settext') {
        const ok = await canv.ui.confirm('Replace the entire document text?')
        if (ok) { await canv.activeDoc.setText('hello from the test extension'); refresh() }
      } else if (action === 'inc') {
        const n = ((await canv.storage.get('counter')) ?? 0) + 1
        await canv.storage.set('counter', n)
        loadCounter()
      } else if (action === 'reset') { await canv.storage.delete('counter'); loadCounter() }
      else if (action === 'notify') { await canv.ui.notify('Hello from the test extension', 'info') }
      else if (action === 'confirm') {
        const ok = await canv.ui.confirm('Are you sure?')
        await canv.ui.notify(ok ? 'You said yes' : 'You said no', 'info')
      } else if (action === 'copy') { await canv.ui.copyToClipboard('hello') }
  } catch (err) {
    await canv.ui.notify('extension error: ' + (err.message || err), 'error')
  }
})

const eventLog = document.getElementById('event-log')
function log(msg) {
  const t = new Date().toLocaleTimeString()
  eventLog.textContent = `[${t}] ${msg}\n` + eventLog.textContent.split('\n').slice(0, 5).join('\n')
}

canv.events.on('activeDocChanged', (info) => { log('activeDocChanged: ' + JSON.stringify(info)); refresh() })
canv.events.on('selectionChanged', (info) => { log('selectionChanged: ' + JSON.stringify(info)); refresh() })

canv.lifecycle.onActivate(() => { log('onActivate'); refresh(); loadCounter() })
canv.lifecycle.onUnload(() => { log('onUnload') })

refresh().then(loadCounter)
