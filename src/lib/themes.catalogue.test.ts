import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { THEMES } from './themes'

const __dirname = dirname(fileURLToPath(import.meta.url))

const REQUIRED_TOKENS = [
  'bg-app', 'bg-panel', 'bg-elev', 'bg-hover', 'bg-active',
  'border-default', 'border-strong',
  'text-default', 'text-muted', 'text-subtle',
  'inverse', 'inverse-fg',
  'accent', 'accent-fg', 'accent-soft', 'accent-hover',
  'warning', 'warning-fg', 'warning-soft',
  'danger', 'danger-fg', 'danger-soft',
  'success', 'success-fg', 'success-soft',
  'info', 'info-fg', 'info-soft',
  'selection-bg',
  'scrollbar-thumb', 'scrollbar-thumb-hover',
  'overlay-shadow', 'shadow-lg',
  'syntax-string', 'syntax-keyword', 'syntax-comment',
]

const css = readFileSync(resolve(__dirname, '..', 'index.css'), 'utf8')

describe('theme catalogue parity', () => {
  for (const t of THEMES) {
    describe(`[data-theme='${t.id}']`, () => {
      const selector = `[data-theme='${t.id}']`
      const start = css.indexOf(selector)
      const open = css.indexOf('{', start)
      const close = css.indexOf('}', open)
      const block = start === -1 ? '' : css.slice(open, close)

      it('exists in src/index.css', () => {
        expect(start).toBeGreaterThan(-1)
      })

      for (const token of REQUIRED_TOKENS) {
        it(`defines --${token}`, () => {
          expect(block).toMatch(new RegExp(`--${token.replace(/[-/]/g, '\\$&')}\\s*:`))
        })
      }
    })
  }
})
