export function legacyStateExists(): boolean {
  try {
    if (localStorage.getItem('canv:schemaVersion') === '2') return false
    return !!localStorage.getItem('canv:document') ||
      !!localStorage.getItem('canv:title') ||
      !!localStorage.getItem('canv:contextFiles')
  } catch {
    return false
  }
}
