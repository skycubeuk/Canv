export interface SearchQuery {
  query: string
  regex: boolean
  caseSensitive: boolean
  /** Optional rel-path prefix filter; empty/undefined means "whole workspace". */
  folder?: string
}

export interface SearchMatch {
  rel: string
  line: number
  /** 0-based column of the first matched character in the ORIGINAL line. */
  col: number
  /** 0-based column of the first matched character within `snippet` (== col for short lines, < col when snippet was sliced). */
  snippetCol: number
  /** Length of the matched span. */
  matchLen: number
  /** The matched line, possibly trimmed if very long. */
  snippet: string
}

export interface SearchResult {
  matches: SearchMatch[]
  /** True when the search hit MAX_MATCHES and stopped early. */
  truncated: boolean
}

export const SEARCH_MAX_FILE_BYTES = 1024 * 1024
export const SEARCH_MAX_MATCHES = 1000
