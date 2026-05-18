// Build a human-readable markdown transcript of a Builder session for
// debugging failed runs — captures conversation, system prompt, errors,
// and final files so a user can share or inspect what the AI actually did.

interface ChatMessage {
  role: string
  content: string
}

interface ManifestSummary {
  id?: string
  name?: string
  version?: string
  capabilities?: string[]
  network?: string[]
  contributions?: unknown[]
  settings?: unknown[]
}

export interface TranscriptInput {
  sessionId: string
  sessionDir?: string | null
  workspace?: string | null
  provider?: string
  model?: string
  generatedAt?: string
  systemPrompt?: string
  history: ChatMessage[]
  errors: string[]
  manifest?: ManifestSummary | null
}

function fence(lang: string, content: string): string {
  return `\`\`\`${lang}\n${content.replace(/```/g, '`​``')}\n\`\`\``
}

function tryParsePayload(raw: string): { manifest?: unknown; files?: Record<string, string> } | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1))
    if (obj && typeof obj === 'object') return obj as { manifest?: unknown; files?: Record<string, string> }
  } catch {
    /* fall through */
  }
  return null
}

export function buildTranscriptMarkdown(input: TranscriptInput): string {
  const lines: string[] = []
  const when = input.generatedAt ?? new Date().toISOString()

  lines.push(`# Canv Extension Builder transcript`)
  lines.push('')
  lines.push(`- **Session:** ${input.sessionId}`)
  if (input.sessionDir) lines.push(`- **Scratch dir:** ${input.sessionDir}`)
  if (input.workspace) lines.push(`- **Workspace:** ${input.workspace}`)
  if (input.provider) lines.push(`- **Provider:** ${input.provider}${input.model ? ` (${input.model})` : ''}`)
  lines.push(`- **Generated:** ${when}`)
  lines.push(`- **Messages:** ${input.history.length}`)
  lines.push(`- **Status:** ${input.errors.length > 0 ? 'errors present' : input.manifest ? 'manifest applied' : 'no manifest yet'}`)
  lines.push('')

  if (input.errors.length > 0) {
    lines.push(`## Latest errors`)
    lines.push('')
    for (const e of input.errors) lines.push(`- ${e}`)
    lines.push('')
  }

  if (input.manifest) {
    lines.push(`## Active manifest`)
    lines.push('')
    const m = input.manifest
    if (m.name) lines.push(`- **Name:** ${m.name}${m.version ? ` v${m.version}` : ''}`)
    if (m.id) lines.push(`- **ID:** ${m.id}`)
    if (m.capabilities?.length) lines.push(`- **Capabilities:** ${m.capabilities.join(', ')}`)
    if (m.network?.length) lines.push(`- **Network:** ${m.network.join(', ')}`)
    if (m.contributions?.length) lines.push(`- **Contributions:** ${m.contributions.length}`)
    lines.push('')
  }

  if (input.systemPrompt) {
    lines.push(`## System prompt`)
    lines.push('')
    lines.push(fence('markdown', input.systemPrompt))
    lines.push('')
  }

  lines.push(`## Conversation`)
  lines.push('')
  if (input.history.length === 0) {
    lines.push(`_No messages._`)
    lines.push('')
  }
  let lastFiles: Record<string, string> | null = null
  input.history.forEach((msg, i) => {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role
    lines.push(`### Turn ${i + 1} — ${role}`)
    lines.push('')
    const parsed = msg.role === 'assistant' ? tryParsePayload(msg.content) : null
    if (parsed) {
      lines.push(`_Parsed as a manifest payload._`)
      lines.push('')
      lines.push(fence('json', JSON.stringify(parsed, null, 2)))
      if (parsed.files && typeof parsed.files === 'object') {
        lastFiles = parsed.files
      }
    } else if (msg.role === 'assistant') {
      lines.push(`_Did not parse as a manifest payload — raw text follows._`)
      lines.push('')
      lines.push(fence('text', msg.content))
    } else {
      lines.push(fence('text', msg.content))
    }
    lines.push('')
  })

  if (lastFiles) {
    lines.push(`## Files in the latest payload`)
    lines.push('')
    for (const [rel, body] of Object.entries(lastFiles)) {
      const ext = rel.split('.').pop() || ''
      lines.push(`### \`${rel}\``)
      lines.push('')
      lines.push(fence(ext, typeof body === 'string' ? body : JSON.stringify(body, null, 2)))
      lines.push('')
    }
  }

  return lines.join('\n')
}
