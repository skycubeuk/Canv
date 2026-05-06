import mammoth from 'mammoth'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export interface ParsedFile {
  text: string
  html?: string
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.md')) {
    const text = await file.text()
    const rawHtml = await marked.parse(text, { gfm: true, breaks: false })
    const html = DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    }) as unknown as string
    return { text, html }
  }
  if (name.endsWith('.txt')) {
    return { text: await file.text() }
  }
  if (name.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return { text: result.value }
  }
  if (name.endsWith('.pdf')) {
    return { text: await parsePdf(file) }
  }
  throw new Error(`Unsupported file type: ${file.name}`)
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (
    (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as { default: string }
  ).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const out: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((it) => ('str' in it && typeof it.str === 'string' ? it.str : ''))
      .join(' ')
    out.push(text)
  }
  return out.join('\n\n')
}
