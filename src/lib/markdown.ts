import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Defence in depth: even though the Markdown renderer escapes HTML by default,
// we still scrub the resulting fragment to drop `javascript:` hrefs and
// `<img onerror>` style attacks before injecting it into the Preview surface.
// Costs ~2ms per call.
const SANITIZE_OPTS = {
  USE_PROFILES: { html: true },
  // Drop hrefs/srcs that don't use safe schemes.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
} as const

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_OPTS) as unknown as string
}

export function markdownToHtml(md: string): string {
  return sanitize(marked.parse(md, { gfm: true, breaks: false, async: false }) as string)
}

export function htmlToMarkdown(html: string): string {
  // DOMParser parses without executing scripts or firing side effects.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: string[] = []
  for (const node of Array.from(doc.body.childNodes)) {
    const md = nodeToMd(node).trim()
    if (md) out.push(md)
  }
  return out.join('\n\n').trim()
}

function nodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  const tag = el.tagName

  if (tag === 'PRE') return preToMd(el)
  if (tag === 'TABLE') return tableToMd(el)
  if (tag === 'HR') return '---'

  const inner = Array.from(el.childNodes).map(nodeToMd).join('')
  switch (tag) {
    case 'H1': return `# ${inner}`
    case 'H2': return `## ${inner}`
    case 'H3': return `### ${inner}`
    case 'H4': return `#### ${inner}`
    case 'H5': return `##### ${inner}`
    case 'H6': return `###### ${inner}`
    case 'P': return inner
    case 'STRONG':
    case 'B': return `**${inner}**`
    case 'EM':
    case 'I': return `*${inner}*`
    case 'S':
    case 'STRIKE':
    case 'DEL': return `~~${inner}~~`
    case 'CODE': return `\`${inner}\``
    case 'BLOCKQUOTE': return inner
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    case 'UL': return Array.from(el.children)
      .map((li) => `- ${nodeChildrenToMd(li).replace(/\n/g, '\n  ')}`)
      .join('\n')
    case 'OL': return Array.from(el.children)
      .map((li, i) => `${i + 1}. ${nodeChildrenToMd(li).replace(/\n/g, '\n   ')}`)
      .join('\n')
    case 'BR': return '\n'
    case 'A': return `[${inner}](${el.getAttribute('href') ?? ''})`
    default: return inner
  }
}

function nodeChildrenToMd(el: Element): string {
  return Array.from(el.childNodes).map(nodeToMd).join('').trim()
}

function preToMd(el: HTMLElement): string {
  const codeEl = el.querySelector('code')
  const text = (codeEl ?? el).textContent ?? ''
  const lang = (() => {
    const cls = codeEl?.getAttribute('class') ?? ''
    const m = cls.match(/language-(\S+)/)
    return m?.[1] ?? ''
  })()
  return `\`\`\`${lang}\n${text.replace(/\n$/, '')}\n\`\`\``
}

function tableToMd(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr'))
  if (!rows.length) return ''
  const cellsForRow = (tr: HTMLTableRowElement) =>
    Array.from(tr.children).map((c) => nodeChildrenToMd(c).replace(/\|/g, '\\|').replace(/\n+/g, ' '))

  const headerRow = rows[0] as HTMLTableRowElement
  const headerCells = cellsForRow(headerRow)
  const lines = [
    `| ${headerCells.join(' | ')} |`,
    `| ${headerCells.map(() => '---').join(' | ')} |`,
  ]
  for (let i = 1; i < rows.length; i++) {
    const cells = cellsForRow(rows[i] as HTMLTableRowElement)
    while (cells.length < headerCells.length) cells.push('')
    lines.push(`| ${cells.join(' | ')} |`)
  }
  return lines.join('\n')
}
