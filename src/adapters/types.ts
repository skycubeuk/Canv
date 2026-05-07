export type Role = 'user' | 'assistant' | 'system' | 'tool'

export interface ToolCall {
  /** Adapter-generated id (e.g. Anthropic 'toolu_…' or OpenAI 'call_…'). Opaque to the runner. */
  id: string
  name: string
  input: unknown
}

export interface ToolResult {
  /** Matches a prior ToolCall.id from the same conversation. */
  id: string
  /** Serialised tool output. Caller stringifies non-string results before passing. */
  content: string
  isError?: boolean
}

export type Message =
  | { role: 'user' | 'system'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolResults: ToolResult[] }

export interface ToolSchema {
  name: string
  description: string
  /** JSON Schema (draft-07 subset). Adapters pass through to the provider. */
  inputSchema: Record<string, unknown>
}

export interface CompleteParams {
  messages: Message[]
  system?: string
  model: string
  maxTokens?: number
  signal?: AbortSignal
  onToken?: (chunk: string) => void
  /** Fires when a tool_use / tool_calls block starts streaming, before its
   *  arguments have finished arriving. Useful for showing a "running" chip
   *  in the UI while the model composes a long tool input. */
  onToolCallStart?: (call: { id: string; name: string }) => void
  apiKey: string
  tools?: ToolSchema[]
  /** When > 0, the adapter paces text/tool dispatches by at least this many
   *  milliseconds between calls. Wire reading still runs at full speed; only
   *  delivery is slowed. Used by A2.4 slow-mode. */
  chunkDelayMs?: number
}

export interface TokenUsage {
  input: number
  output: number
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'cancelled'

export interface CompleteResult {
  text: string
  truncated: boolean
  tokenUsage?: TokenUsage
  toolCalls?: ToolCall[]
  stopReason: StopReason
}

export interface LLMAdapter {
  name: string
  id: string
  models: string[]
  complete(params: CompleteParams): Promise<CompleteResult>
}
