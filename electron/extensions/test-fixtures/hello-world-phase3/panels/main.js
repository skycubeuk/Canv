// electron/extensions/test-fixtures/hello-world-phase3/panels/main.js

function out(id, text, isError = false) {
  const el = document.getElementById(id)
  el.textContent = text
  el.classList.toggle('err', isError)
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]')
  if (!btn) return
  const action = btn.dataset.action
  try {
    if (action === 'ai') {
      out('ai-out', 'asking…')
      const text = await canv.activeDoc.getText()
      const snippet = (text || '').slice(0, 800)
      const r = await canv.ai.ask('Summarise this document in one sentence: ' + snippet)
      out('ai-out', r.text + '\n\n[usage: in=' + r.usage.in + ' out=' + r.usage.out + ']')
    } else if (action === 'net-good') {
      out('net-out', 'fetching…')
      const res = await canv.net.fetch('https://wttr.in/?format=3')
      const body = await res.text()
      out('net-out', 'status ' + res.status + ': ' + body)
    } else if (action === 'net-github') {
      out('net-out', 'fetching github…')
      const res = await canv.net.fetch('https://api.github.com/zen')
      const body = await res.text()
      out('net-out', 'status ' + res.status + ': ' + body)
    } else if (action === 'net-bad') {
      out('net-out', 'fetching evil…')
      try {
        await canv.net.fetch('https://evil.example.com/x')
        out('net-out', 'UNEXPECTED: should have been rejected', true)
      } catch (err) {
        out('net-out', 'rejected (expected): ' + err.message)
      }
    } else if (action === 'pick') {
      out('pick-out', 'picking…')
      const v = await canv.ui.quickPick([
        { label: 'red',   value: 'red' },
        { label: 'green', value: 'green' },
        { label: 'blue',  value: 'blue' },
      ], { placeholder: 'pick a colour' })
      out('pick-out', v == null ? '(cancelled)' : 'you picked: ' + v)
    } else if (action === 'input') {
      out('input-out', 'asking…')
      const name = await canv.ui.input({ prompt: 'What is your name?', placeholder: 'your name' })
      out('input-out', name == null ? '(cancelled)' : 'hello, ' + name + '!')
    }
  } catch (err) {
    const id = action.startsWith('net') ? 'net-out' : action + '-out'
    out(id, 'error: ' + (err.message || err), true)
  }
})

canv.lifecycle.onActivate(() => {
  console.log('[hello-world-phase3] activated')
})
