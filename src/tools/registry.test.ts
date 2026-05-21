import { describe, it, expect } from 'vitest'
import { allTools, getTool, mutatingNames, toolSchemas } from './registry'

describe('registry', () => {
  it('exports all 13 tools', () => {
    const names = allTools().map((t) => t.name)
    expect(names.sort()).toEqual([
      'apply_edits',
      'create_file', 'create_folder', 'delete_file', 'edit_file',
      'file_metadata',
      'list_dir', 'read_file', 'rename_file', 'search_workspace', 'set_todos',
      'site_register', 'site_update',
    ])
  })

  it('looks up by name', () => {
    expect(getTool('read_file')?.name).toBe('read_file')
    expect(getTool('nope')).toBeUndefined()
  })

  it('marks the right tools as mutating', () => {
    expect(mutatingNames().sort()).toEqual([
      'apply_edits',
      'create_file', 'create_folder', 'delete_file', 'edit_file', 'rename_file',
      'site_register', 'site_update',
    ])
  })

  it('produces schemas with name/description/inputSchema only', () => {
    const schemas = toolSchemas()
    expect(schemas).toHaveLength(13)
    for (const s of schemas) {
      expect(typeof s.name).toBe('string')
      expect(typeof s.description).toBe('string')
      expect(s.inputSchema && typeof s.inputSchema).toBe('object')
      expect(Object.keys(s)).toEqual(['name', 'description', 'inputSchema'])
    }
  })
})

describe('registry — site tools', () => {
  it('exposes site_register and site_update', () => {
    const names = allTools().map((t) => t.name)
    expect(names).toContain('site_register')
    expect(names).toContain('site_update')
  })
})

describe('registry — set_todos', () => {
  it('is registered as a non-mutating tool', () => {
    const tool = getTool('set_todos')
    expect(tool).toBeDefined()
    expect(tool?.mutating).toBe(false)
  })

  it('is included in tool schemas sent to the model', () => {
    const names = toolSchemas().map((s) => s.name)
    expect(names).toContain('set_todos')
  })

  it('is not listed as mutating', () => {
    expect(mutatingNames()).not.toContain('set_todos')
  })

  it('is included in allTools()', () => {
    expect(allTools().map((t) => t.name)).toContain('set_todos')
  })
})
