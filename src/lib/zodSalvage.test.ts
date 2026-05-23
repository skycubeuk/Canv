import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { salvage } from './zodSalvage'

const Schema = z.object({
  name: z.string().default('anon'),
  age: z.number().int().min(0).max(120).default(0),
  active: z.boolean().default(true),
})

describe('salvage', () => {
  it('returns parsed values when every field is valid', () => {
    const r = salvage(Schema, { name: 'ada', age: 36, active: false })
    expect(r.value).toEqual({ name: 'ada', age: 36, active: false })
    expect(r.dropped).toEqual([])
  })

  it('replaces invalid fields with defaults and reports drops', () => {
    const r = salvage(Schema, { name: 'ada', age: 'not-a-number', active: true })
    expect(r.value).toEqual({ name: 'ada', age: 0, active: true })
    expect(r.dropped).toEqual(['age'])
  })

  it('treats absent fields as defaults but does not list them as dropped', () => {
    const r = salvage(Schema, { name: 'ada' })
    expect(r.value).toEqual({ name: 'ada', age: 0, active: true })
    expect(r.dropped).toEqual([])
  })

  it('falls back to all defaults when raw is null', () => {
    const r = salvage(Schema, null)
    expect(r.value).toEqual({ name: 'anon', age: 0, active: true })
    expect(r.dropped).toEqual([])
  })

  it('falls back to all defaults when raw is not an object', () => {
    const r = salvage(Schema, 'definitely-not-settings')
    expect(r.value).toEqual({ name: 'anon', age: 0, active: true })
    expect(r.dropped).toEqual([])
  })

  it('throws if a field has no default', () => {
    const NoDefault = z.object({ x: z.string() })
    expect(() => salvage(NoDefault, {})).toThrow(/no default/)
  })
})
