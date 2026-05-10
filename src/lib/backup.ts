const PREFIX = 'canv:'
const FORMAT_VERSION = 1

interface BackupFile {
  app: 'canv'
  version: number
  exportedAt: string
  data: Record<string, string>
}

export function exportBackup(): void {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(PREFIX)) continue
    const value = localStorage.getItem(key)
    if (value !== null) data[key] = value
  }

  const payload: BackupFile = {
    app: 'canv',
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `canv-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importBackup(file: File): Promise<void> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup file is malformed')
  }
  const obj = parsed as Partial<BackupFile>
  if (obj.app !== 'canv') {
    throw new Error('Not a Canv backup file')
  }
  if (!obj.data || typeof obj.data !== 'object') {
    throw new Error('Backup file has no data')
  }

  for (const [key, value] of Object.entries(obj.data)) {
    if (!key.startsWith(PREFIX)) continue
    if (typeof value !== 'string') continue
    localStorage.setItem(key, value)
  }
}
