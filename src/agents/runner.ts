import type { Action as AgentDef } from '../config/types'
import type { LLMAdapter, CompleteResult, Message } from '../adapters/types'

export interface RunAgentParams {
  agent: AgentDef
  text: string
  instruction?: string
  contextSummaries?: string[]
  documentBody?: string
  promptTemplate: string
  adapter: LLMAdapter
  apiKey: string
  baseUrl?: string
  model: string
  maxTokens: number
  signal?: AbortSignal
  onToken?: (chunk: string) => void
  chunkDelayMs?: number
}

export function buildPrompt(params: {
  template: string
  text: string
  instruction?: string
  contextSummaries?: string[]
  documentBody?: string
}): string {
  const { template, text, instruction, contextSummaries, documentBody } = params

  const parts: string[] = []
  if (documentBody && documentBody.trim() && documentBody.trim() !== text.trim()) {
    parts.push(
      `Full document the user is editing (for context — do not edit, only the SELECTION below should be edited):\n\n${documentBody}`,
    )
  }
  if (contextSummaries && contextSummaries.length) {
    parts.push(
      `Background context from uploaded files:\n\n${contextSummaries.map((s, i) => `[File ${i + 1}]\n${s}`).join('\n\n')}`,
    )
  }
  const contextBlock = parts.join('\n\n')

  return template
    .replace('{{text}}', () => text)
    .replace('{{instruction}}', () => instruction ?? '')
    .replace('{{context}}', () => contextBlock)
}

export async function runAgent(params: RunAgentParams): Promise<CompleteResult & { rawMessages: Message[] }> {
  const prompt = buildPrompt({
    template: params.promptTemplate,
    text: params.text,
    instruction: params.instruction,
    contextSummaries: params.contextSummaries,
    documentBody: params.documentBody,
  })

  const messages: Message[] = [{ role: 'user', content: prompt }]

  const result = await params.adapter.complete({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    messages,
    signal: params.signal,
    onToken: params.onToken,
    maxTokens: params.maxTokens,
    chunkDelayMs: params.chunkDelayMs,
  })

  return { ...result, rawMessages: messages }
}

export interface ParsedAgentResponse {
  feedback?: string
  rewrite?: string
  raw: string
}

export function parseAgentResponse(agent: { outputMode: string }, raw: string): ParsedAgentResponse {
  if (agent.outputMode === 'replacement') {
    return { rewrite: raw.trim(), raw }
  }

  if (agent.outputMode === 'feedback-only') {
    const m = raw.match(/^\s*NOTES\s*:\s*([\s\S]*)$/im)
    return { feedback: (m?.[1] ?? raw).trim(), raw }
  }

  const issuesMatch = raw.match(/^\s*(?:ISSUES|NOTES)\s*:\s*([\s\S]*?)(?=\n\s*(?:CORRECTED|SUGGESTED REWRITE)\s*:|(?![\s\S]))/im)
  const rewriteMatch = raw.match(/^\s*(?:CORRECTED|SUGGESTED REWRITE)\s*:\s*([\s\S]*)$/im)

  const feedback = issuesMatch?.[1]?.trim()
  const rewrite = rewriteMatch?.[1]?.trim()

  if (!feedback && !rewrite) {
    return { feedback: raw.trim(), raw }
  }
  return { feedback, rewrite, raw }
}
