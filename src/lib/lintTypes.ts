/**
 * Shared types for the structural lint engine. Pure data; no behaviour.
 *
 * The engine runs over markdown source text (not editor HTML — callers convert
 * via htmlToMarkdown when linting in-flight tab content).
 */

export type LintSeverity = 'warn' | 'error'

export type LintRuleId =
  | 'broken-link'
  | 'front-matter'
  | 'heading-skip'
  | 'dead-image'

export interface LintIssue {
  /** Workspace-relative path of the file. */
  rel: string
  /** 1-based line number where the issue starts. */
  line: number
  /** Verbatim text fragment that caused the issue (used for jump-to-match via findMatchInDoc). */
  match: string
  severity: LintSeverity
  rule: LintRuleId
  /** Human-readable, single-sentence message. */
  message: string
}

export interface LintOptions {
  brokenLinks: boolean
  frontMatter: boolean
  headingSkip: boolean
  deadImages: boolean
}

/** Set of valid workspace-relative file paths, used to resolve link/image targets. */
export type WorkspaceFiles = Set<string>

export const DEFAULT_LINT_OPTIONS: LintOptions = {
  brokenLinks: true,
  frontMatter: true,
  headingSkip: true,
  deadImages: true,
}
