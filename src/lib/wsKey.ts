function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function wsKey(root: string, suffix: string): string {
  return `canv:ws:${djb2(root)}:${suffix}`
}
