import { describe, it, expect } from 'vitest'
import { buildChatSystemPreamble } from './buildChatSystemPreamble'
import { makeTestMode } from '../test/fixtures'

describe('buildChatSystemPreamble', () => {
  it('starts with the profile\'s chatSystemPrompt followed by a blank line', () => {
    const profile = makeTestMode({ chatSystemPrompt: 'You are Foo.' })
    const out = buildChatSystemPreamble({ activeProfile: profile })
    expect(out.startsWith('You are Foo.\n\n')).toBe(true)
  })

  it('contains the static "WHEN TO EDIT" guidance block', () => {
    const profile = makeTestMode()
    const out = buildChatSystemPreamble({ activeProfile: profile })
    expect(out).toContain('WHEN TO EDIT — read carefully:')
    expect(out).toContain('HOW TO EDIT — when an edit is warranted')
    expect(out).toContain('PLANNING. For any task that will take 3 or more tool calls')
  })

  it('is deterministic for a given profile', () => {
    const profile = makeTestMode({ chatSystemPrompt: 'Stable.' })
    expect(buildChatSystemPreamble({ activeProfile: profile }))
      .toBe(buildChatSystemPreamble({ activeProfile: profile }))
  })
})
