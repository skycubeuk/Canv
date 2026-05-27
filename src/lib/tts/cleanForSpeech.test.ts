import { describe, it, expect } from 'vitest'
import { cleanForSpeech } from './cleanForSpeech'

describe('cleanForSpeech', () => {
  it('strips heading markers and keeps the words', () => {
    expect(cleanForSpeech('# Hello world')).toBe('Hello world')
  })
  it('keeps link text, drops the URL', () => {
    expect(cleanForSpeech('See [the docs](https://x.com).')).toBe('See the docs.')
  })
  it('removes emphasis markers', () => {
    expect(cleanForSpeech('This is **bold** and *italic*.')).toBe('This is bold and italic.')
  })
  it('drops fenced code blocks entirely', () => {
    expect(cleanForSpeech('Before\n\n```js\nconst x = 1\n```\n\nAfter')).toBe('Before After')
  })
  it('collapses whitespace', () => {
    expect(cleanForSpeech('a\n\n\nb   c')).toBe('a b c')
  })
})
