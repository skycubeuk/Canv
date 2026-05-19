# Language contribution

A language contribution wires a CodeMirror `LanguageSupport` object into Canv's editor,
providing syntax highlighting, indentation, and folding for a file type not natively supported.

## CRITICAL SECURITY WARNING

Language extensions run with the **same privileges as Canv itself** — they are not sandboxed like panels.
They trigger a **separate red install prompt** where the normal Install button is replaced with
**"I understand — install anyway"**.

**Only emit a `language` contribution when the user has clearly and explicitly asked for
in-editor syntax highlighting for a specific file type.** Never suggest it proactively.
Never bundle it into a general-purpose extension unless that is the extension's entire purpose.

## Manifest shape

```json
{
  "type": "language",
  "extensions": [".tex"],
  "entry": "language/tex.js"
}
```

## Field semantics

| Field | Required | Notes |
|---|---|---|
| `type` | YES | Always `"language"` |
| `extensions` | YES | Dot-prefixed lowercase extensions this language handles: `[".tex", ".sty"]`. |
| `entry` | YES | Relative path to a JS file. Must be a key in `files`. |

## Entry contract

The entry JS file must export a **default function** that receives CodeMirror primitives
as a `deps` argument and returns a `LanguageSupport` instance.

**Bare `import` from npm packages (`import ... from '@codemirror/language'`) does NOT
work** — extensions don't have access to npm at runtime. Take what you need from `deps`.

```js
// language/tex.js
export default function ({ LanguageSupport, StreamLanguage }) {
  const tex = StreamLanguage.define({
    token(stream) {
      if (stream.match(/\\[a-zA-Z]+/)) return 'keyword'
      if (stream.match(/%.*/)) return 'comment'
      stream.next()
      return null
    },
  })
  return new LanguageSupport(tex)
}
```

- The entry uses **ES module syntax** (`export default`). CommonJS (`require`) is not supported.
- Do not write `import` statements for CodeMirror — destructure from the `deps` argument instead.

## Available dependencies

Canv injects these into your default-export function:

| From `deps` | Origin | Use for |
|---|---|---|
| `LanguageSupport` | `@codemirror/language` | Wraps a parser/streamer into something the editor can mount. |
| `StreamLanguage` | `@codemirror/language` | Simple token-based languages — your `token(stream)` returns highlight tags. |
| `LRLanguage` | `@codemirror/language` | Lezer-based parser languages (more powerful, more setup). |
| `LanguageDescription` | `@codemirror/language` | Lazy-load a language (rarely needed). |
| `defineLanguageFacet`, `foldNodeProp`, `foldInside`, `indentNodeProp` | `@codemirror/language` | Folding + indentation hooks. |
| `syntaxTree` | `@codemirror/language` | Read the current parse tree (advanced use). |
| `styleTags`, `tags` | `@lezer/highlight` | Map syntax-tree node names to highlight tags. |

If you need a primitive that's not in this list, fall back to a simpler approach using
`StreamLanguage.define(...)` — it covers most language definitions in 50 lines.

## Minimal complete example — TeX / LaTeX syntax

```json
{
  "manifest": {
    "id": "tex-language",
    "name": "TeX / LaTeX Language",
    "version": "1.0.0",
    "description": "Adds TeX and LaTeX syntax highlighting to Canv's editor.",
    "capabilities": [],
    "contributions": [{
      "type": "language",
      "extensions": [".tex", ".sty", ".cls"],
      "entry": "language/tex.js"
    }]
  },
  "files": {
    "language/tex.js": "export default function({ LanguageSupport, StreamLanguage }) { const tex = StreamLanguage.define({ token(stream) { if (stream.match(/\\\\[a-zA-Z]+/)) return 'keyword'; if (stream.match(/%.*/)) return 'comment'; stream.next(); return null } }); return new LanguageSupport(tex) }"
  }
}
```

## Pitfalls

- **Not exporting a default function** — Canv calls the export; if it's not callable, the editor silently falls back to plain text.
- **Returning a class instance instead of a function** — the export must be a function, not the `LanguageSupport` object directly.
- **Writing `import { ... } from '@codemirror/language'`** — bare specifiers don't resolve at runtime. Destructure from the `deps` argument instead.
- **Using `require()`** — entries are treated as ES modules; use `export default`.
- **Requesting a `language` contribution without user intent** — the red install prompt will alarm users. Only emit when explicitly asked.
- **Extension conflicts** — if another extension already handles `.tex`, the last-installed wins. Warn in your `description`.
