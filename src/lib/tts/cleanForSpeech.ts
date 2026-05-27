import { markdownToHtml } from '../markdown'

/** Convert Markdown source into plain prose suitable for text-to-speech. */
export function cleanForSpeech(markdown: string): string {
  // Drop fenced code blocks before rendering so code isn't spoken.
  const withoutFences = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ')
  const html = markdownToHtml(withoutFences)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = doc.body.textContent ?? ''
  return text.replace(/\s+/g, ' ').trim()
}
