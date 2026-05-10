import type { Tool, ToolCtx } from '../types'
import type { DirNode } from '../../lib/fs'
import { validateToolPath } from '../paths'
import { findEntry } from '../../lib/fs'
import { parseMarkdownMeta, type OptionalField } from './markdown_meta'

const MAX_PATHS = 200
const MAX_PARSE_BYTES = 1024 * 1024
const VALID_FIELDS: OptionalField[] = ['links', 'images', 'code_blocks', 'todos']

type ErrorCode = 'not_found' | 'not_a_file' | 'binary' | 'read_failed'

interface Heading { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; anchor: string }
interface LinkRef { text: string; target: string }
interface ImageRef { alt: string; src: string }
interface CodeBlockRef { lang: string | null; lines: number }
interface TodoCounts { open: number; done: number }

interface FileMeta {
  path: string
  error?: ErrorCode
  size_bytes?: number
  mtime_ms?: number
  binary?: boolean
  extension?: string
  words?: number
  chars?: number
  lines?: number
  paragraphs?: number
  reading_time_min?: number
  frontmatter?: Record<string, unknown> | null
  headings?: Heading[]
  excerpt?: string
  truncated?: true
  links?: LinkRef[]
  images?: ImageRef[]
  code_blocks?: CodeBlockRef[]
  todos?: TodoCounts
}

interface Input {
  paths: string[]
  fields?: string[]
}

interface Output {
  files: FileMeta[]
}

export const fileMetadataTool: Tool<Input, Output> = {
  name: 'file_metadata',
  description: [
    'Get structured metadata for one or more workspace files — word/heading/frontmatter/excerpt — without returning the file bodies in the response.',
    'Use this instead of read_file when you only need to know things *about* the files (counts, structure, titles, draft status) rather than their prose. Accepts 1–200 paths per call.',
    '',
    'Default output for .md / .mdx files: size, mtime, binary flag, extension, word/char/line/paragraph counts, reading_time_min, parsed YAML frontmatter, heading outline (level + text + slug), and a ~280-char excerpt. For non-markdown files only `size_bytes`, `mtime_ms`, `binary`, and `extension` are returned.',
    '',
    'Pass fields: ["links", "images", "code_blocks", "todos"] (any subset) to request the heavier opt-in fields when you actually need them.',
    '',
    'Per-file errors (file not found, binary, etc.) appear inline as { path, error } entries and never fail the whole call.',
  ].join('\n'),
  mutating: false,
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: '1–200 workspace-relative file paths.',
      },
      fields: {
        type: 'array',
        items: { type: 'string', enum: ['links', 'images', 'code_blocks', 'todos'] },
        description: 'Opt-in fields to populate beyond the default base tier.',
      },
    },
    required: ['paths'],
  },
  async handler(input, ctx) {
    if (!input || !Array.isArray(input.paths)) {
      throw new Error('paths is required and must be an array of strings')
    }
    if (input.paths.length === 0) {
      throw new Error('paths must contain at least one entry')
    }
    if (input.paths.length > MAX_PATHS) {
      throw new Error(`paths supports up to ${MAX_PATHS} entries per call`)
    }
    const requestedFields = (input.fields ?? [])
      .filter((f): f is OptionalField => (VALID_FIELDS as string[]).includes(f))

    const seen = new Set<string>()
    const ordered: string[] = []
    for (const raw of input.paths) {
      const v = validateToolPath(raw)
      if (!v.ok) throw new Error(v.error)
      if (seen.has(v.rel)) continue
      seen.add(v.rel)
      ordered.push(v.rel)
    }

    const root = await ctx.fs.listDir('')
    const files: FileMeta[] = []
    for (const rel of ordered) {
      files.push(await processOne(rel, root, requestedFields, ctx))
    }
    return { files }
  },
}

async function processOne(
  rel: string,
  root: DirNode,
  fields: OptionalField[],
  ctx: ToolCtx,
): Promise<FileMeta> {
  const entry = findEntry(root, rel)
  if (!entry) return { path: rel, error: 'not_found' }
  if (entry.kind !== 'file') {
    return { path: rel, error: 'not_a_file' }
  }
  const base: FileMeta = {
    path: rel,
    size_bytes: entry.size,
    mtime_ms: entry.mtimeMs,
    binary: entry.binary,
    extension: extensionOf(rel),
  }
  if (entry.binary) return { ...base, error: 'binary' }
  if (!isMarkdownExt(base.extension!)) return base

  let body: string
  try {
    if (ctx.activeDocPath === rel) {
      const live = ctx.getEditorContent(rel)
      body = live ?? (await ctx.fs.readFile(rel)).content
    } else {
      body = (await ctx.fs.readFile(rel)).content
    }
  } catch {
    return { ...base, error: 'read_failed' }
  }

  let truncated = false
  if (body.length > MAX_PARSE_BYTES) {
    body = body.slice(0, MAX_PARSE_BYTES)
    truncated = true
  }

  const parsed = parseMarkdownMeta(body, { fields })
  const out: FileMeta = {
    ...base,
    words: parsed.words,
    chars: parsed.chars,
    lines: parsed.lines,
    paragraphs: parsed.paragraphs,
    reading_time_min: parsed.readingTimeMin,
    frontmatter: parsed.frontmatter,
    headings: parsed.headings,
    excerpt: parsed.excerpt,
  }
  if (truncated) out.truncated = true
  if (parsed.links !== undefined) out.links = parsed.links
  if (parsed.images !== undefined) out.images = parsed.images
  if (parsed.codeBlocks !== undefined) out.code_blocks = parsed.codeBlocks
  if (parsed.todos !== undefined) out.todos = parsed.todos
  return out
}

function extensionOf(rel: string): string {
  const slash = rel.lastIndexOf('/')
  const name = slash === -1 ? rel : rel.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot).toLowerCase()
}

function isMarkdownExt(ext: string): boolean {
  return ext === '.md' || ext === '.mdx'
}
