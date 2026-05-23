export type ThemeId =
  | 'system'
  | 'canv-dark'
  | 'canv-light'
  | 'dracula'
  | 'alucard'
  | 'synthwave-84'
  | 'solarized-dark'
  | 'solarized-light'
  | 'nord'
  | 'tokyo-night'
  | 'gruvbox'
  | 'dark-2026'

export interface ThemeDescriptor {
  id: Exclude<ThemeId, 'system'>
  name: string
  kind: 'dark' | 'light'
}

export const THEMES: readonly ThemeDescriptor[] = [
  { id: 'canv-dark',       name: 'Canv Dark',       kind: 'dark'  },
  { id: 'canv-light',      name: 'Canv Light',      kind: 'light' },
  { id: 'dracula',         name: 'Dracula',         kind: 'dark'  },
  { id: 'alucard',         name: 'Alucard',         kind: 'light' },
  { id: 'synthwave-84',    name: "Synthwave '84",   kind: 'dark'  },
  { id: 'solarized-dark',  name: 'Solarized Dark',  kind: 'dark'  },
  { id: 'solarized-light', name: 'Solarized Light', kind: 'light' },
  { id: 'nord',            name: 'Nord',            kind: 'dark'  },
  { id: 'tokyo-night',     name: 'Tokyo Night',     kind: 'dark'  },
  { id: 'gruvbox',         name: 'Gruvbox',         kind: 'dark'  },
  { id: 'dark-2026',       name: 'Dark 2026',       kind: 'dark'  },
] as const

export const DEFAULT_THEME: Exclude<ThemeId, 'system'> = 'canv-dark'

const VALID_IDS = new Set<string>(['system', ...THEMES.map((t) => t.id)])
export function isThemeId(s: unknown): s is ThemeId {
  return typeof s === 'string' && VALID_IDS.has(s)
}
