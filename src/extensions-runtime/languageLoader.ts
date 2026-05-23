import type { LanguageRecord } from '../types/extension-contributions'
import { LanguageSupport, LRLanguage, StreamLanguage, LanguageDescription, defineLanguageFacet, foldNodeProp, indentNodeProp, syntaxTree, foldInside } from '@codemirror/language'
import { styleTags, tags } from '@lezer/highlight'

// The dependency bundle handed to every language extension's entry function.
// Extensions cannot `import` from npm at runtime (bare specifiers don't
// resolve via canv-extension://) — instead the loader injects what they need
// here, drawn from Canv's own bundled copies.
export const LANGUAGE_DEPS = {
  LanguageSupport,
  LRLanguage,
  StreamLanguage,
  LanguageDescription,
  defineLanguageFacet,
  foldNodeProp,
  foldInside,
  indentNodeProp,
  syntaxTree,
  styleTags,
  tags,
} as const

export type LanguageDeps = typeof LANGUAGE_DEPS

type LanguageEntry = { default?: (deps: LanguageDeps) => unknown }

interface Opts {
  fetcher?: (url: string) => Promise<LanguageEntry | null>
}

function extOf(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i).toLowerCase() : ''
}

async function defaultFetcher(url: string): Promise<LanguageEntry | null> {
  try {
    return await import(/* @vite-ignore */ url) as LanguageEntry
  } catch {
    return null
  }
}

export async function loadLanguageFor(relOrAbsPath: string, opts: Opts = {}): Promise<unknown | null> {
  const ext = extOf(relOrAbsPath)
  if (!ext) return null
  const all = (await window.canvExtensions?.readAllContributions?.()) ?? { languages: [] as LanguageRecord[] }
  const languages: LanguageRecord[] = ((all as { languages?: LanguageRecord[] }).languages ?? [])
  const match = languages.find((l) => l.extensions.includes(ext))
  if (!match) return null
  const fetcher = opts.fetcher ?? defaultFetcher
  try {
    const mod = await fetcher(`canv-extension://${match.extensionId}/${match.entry}`)
    if (!mod || typeof mod.default !== 'function') return null
    return mod.default(LANGUAGE_DEPS)
  } catch (err) {
    console.warn('[canv:language] failed to load', match.extensionId, err)
    return null
  }
}
