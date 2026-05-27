import { describe, it, expect, vi } from 'vitest'
import type { Command } from '../hooks/useCommands'
import { tts } from './tts.contribution'

describe('tts.contribution', () => {
  it('registers a read-document command that reads the active doc', () => {
    const register = vi.fn((_cmd: Command) => () => {})
    const readAloud = vi.fn()
    const services = {
      commands: { register },
      recordings: { readAloud },
      editorRegistry: { getActiveEditor: () => ({ state: { doc: { toString: () => '# Title\n\nBody.' } } }) },
      workspace: { activeMarkdownRel: 'a.md' },
    }
    tts.register(services as never)
    expect(register).toHaveBeenCalled()
    const cmd = register.mock.calls[0]![0]!
    expect(cmd.id).toBe('tts.readDocument')
    cmd.run()
    expect(readAloud).toHaveBeenCalledWith(expect.objectContaining({ sourceKind: 'document', sourcePath: 'a.md' }))
  })
})
