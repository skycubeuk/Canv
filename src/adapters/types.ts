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
  /** True when the user declined the approval prompt for the originating tool call.
   *  Renderers use this to distinguish "denied" from "ran and failed". */
  isUserDenial?: true
}

export type Message =
  | { role: 'user' | 'system'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[]; thinkingBlocks?: unknown[] }
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
  /** Base URL for providers that talk to a user-configurable endpoint (Ollama).
   *  Cloud adapters ignore this. */
  baseUrl?: string
  tools?: ToolSchema[]
  /** When > 0, the adapter paces text/tool dispatches by at least this many
   *  milliseconds between calls. Wire reading still runs at full speed; only
   *  delivery is slowed. Used by A2.4 slow-mode. */
  chunkDelayMs?: number
}

export interface TokenUsage {
  /** Uncached input tokens billed at the full rate. With prompt caching on,
   *  this is the remainder only — total prompt = input + cacheRead + cacheWrite. */
  input: number
  output: number
  /** Tokens served from the provider's prompt cache (~0.1× input price). */
  cacheRead?: number
  /** Tokens written to the provider's prompt cache (~1.25× input price). */
  cacheWrite?: number
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'cancelled' | 'refusal'

export interface CompleteResult {
  text: string
  truncated: boolean
  tokenUsage?: TokenUsage
  toolCalls?: ToolCall[]
  stopReason: StopReason
  /** Provider-opaque thinking blocks (signature included) from this turn.
   *  Claude Fable 5 requires them to be passed back verbatim on the next
   *  request when the turn contains tool calls. Never render their content. */
  thinkingBlocks?: unknown[]
  /** Populated when stopReason === 'refusal' (Claude Fable 5 safety
   *  classifiers). Both fields can be null — that's a normal terminal value. */
  refusal?: { category: string | null; explanation: string | null }
}

export interface LLMAdapter {
  name: string
  id: string
  models: string[]
  /** Optional dynamic model discovery (Ollama uses this). When present, the
   *  Settings UI can refresh the model list from a live endpoint. */
  listModels?: (baseUrl: string, signal?: AbortSignal) => Promise<string[]>
  complete(params: CompleteParams): Promise<CompleteResult>
}
