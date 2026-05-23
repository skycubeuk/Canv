/**
 * Forbids raw Tailwind palette utilities and raw colour literals in JSX
 * className / style props.
 *
 * Allowed: token-backed utilities (`bg-app`, `bg-success-soft`,
 * `border-default`), token references via CSS vars
 * (`bg-[rgb(var(--accent))]`, `style={{ color: 'rgb(var(--accent))' }}`),
 * and named utilities the design system intends (`bg-border-default`).
 *
 * Disabled per-line with:
 *   // eslint-disable-next-line canv/no-raw-color -- <reason>
 */

const PALETTE_RE = /\b(text|bg|border|ring|from|to|via|fill|stroke|shadow|outline|divide|placeholder|accent|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
// Numeric rgb/rgba — matches the open paren followed by a digit. Token
// references like rgb(var(--accent)) start with 'v', so they don't match.
const NUMERIC_RGB_RE = /\brgba?\s*\(\s*\d/g

function checkString(context, node, raw) {
  // Reset lastIndex before each use (global regexes are stateful)
  PALETTE_RE.lastIndex = 0
  HEX_RE.lastIndex = 0
  NUMERIC_RGB_RE.lastIndex = 0

  let m
  while ((m = PALETTE_RE.exec(raw)) !== null) {
    context.report({ node, message: 'raw palette utility — use a token-backed class (e.g. bg-success-soft, text-danger-fg)' })
  }
  while ((m = HEX_RE.exec(raw)) !== null) {
    context.report({ node, message: 'raw hex colour literal — use a CSS variable (e.g. rgb(var(--accent)))' })
  }
  while ((m = NUMERIC_RGB_RE.exec(raw)) !== null) {
    context.report({ node, message: 'numeric rgb/rgba literal — use a token reference (e.g. rgb(var(--accent)) or var(--overlay-shadow))' })
  }
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'forbid raw palette utilities and colour literals in JSX' },
    schema: [],
    messages: {},
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (!node.name || (node.name.name !== 'className' && node.name.name !== 'style')) return
        const value = node.value
        if (!value) return

        // <div className="…" />
        if (value.type === 'Literal' && typeof value.value === 'string') {
          checkString(context, value, value.value)
          return
        }
        // <div className={`…`} /> — only flat template strings
        if (value.type === 'JSXExpressionContainer') {
          const exp = value.expression
          if (exp.type === 'TemplateLiteral') {
            for (const q of exp.quasis) checkString(context, q, q.value.raw)
          } else if (exp.type === 'Literal' && typeof exp.value === 'string') {
            checkString(context, exp, exp.value)
          } else if (exp.type === 'ObjectExpression' && node.name.name === 'style') {
            // style={{ key: "…" }}
            for (const p of exp.properties) {
              if (p.type !== 'Property') continue
              if (p.value.type === 'Literal' && typeof p.value.value === 'string') {
                checkString(context, p.value, p.value.value)
              } else if (p.value.type === 'TemplateLiteral') {
                for (const q of p.value.quasis) checkString(context, q, q.value.raw)
              }
            }
          }
        }
      },
    }
  },
}
