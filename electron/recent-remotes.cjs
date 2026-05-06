const fs = require('node:fs')

class RecentRemotes {
  constructor(filePath) { this.file = filePath }
  list() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      return Array.isArray(data.entries) ? data.entries : []
    } catch { return [] }
  }
  record(raw) {
    const cur = this.list().filter((e) => e.raw !== raw)
    cur.unshift({ raw, lastUsedMs: Date.now() })
    while (cur.length > 10) cur.pop()
    fs.writeFileSync(this.file, JSON.stringify({ entries: cur }, null, 2))
  }
}

module.exports = { RecentRemotes }
