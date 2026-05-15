import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { smartTime, fullTime, formatSnapshotLabel } from './historyLabels'
import type { SnapshotEntry } from './historyTypes'

// Fixed "now" used as the second argument to smartTime so cases are deterministic.
const NOW = new Date(2026, 4, 14, 14, 23, 7) // 2026-05-14 14:23:07 local

function localIso(y: number, mo: number, d: number, h: number, mi: number, s = 0): string {
  // Build a local-time Date then return its ISO; smartTime parses ISO and uses
  // local accessors, so this round-trips cleanly for tests.
  return new Date(y, mo, d, h, mi, s).toISOString()
}

describe('smartTime', () => {
  it('returns HH:MM for a snapshot earlier the same calendar day', () => {
    expect(smartTime(localIso(2026, 4, 14, 9, 5), NOW)).toBe('09:05')
  })

  it('returns "Yesterday HH:MM" for the previous calendar day', () => {
    expect(smartTime(localIso(2026, 4, 13, 23, 59), NOW)).toBe('Yesterday 23:59')
  })

  it('returns "DD Mon HH:MM" for an earlier date in the same year', () => {
    expect(smartTime(localIso(2026, 2, 8, 14, 31), NOW)).toBe('08 Mar 14:31')
  })

  it('returns "DD Mon YYYY HH:MM" for a date in a previous year', () => {
    expect(smartTime(localIso(2025, 10, 2, 10, 0), NOW)).toBe('02 Nov 2025 10:00')
  })

  it('zero-pads single-digit days, hours, and minutes', () => {
    expect(smartTime(localIso(2026, 2, 3, 4, 5), NOW)).toBe('03 Mar 04:05')
  })
})

describe('fullTime', () => {
  it('formats day, month, year and HH:MM:SS', () => {
    expect(fullTime(localIso(2026, 4, 14, 14, 23, 7))).toBe('14 May 2026, 14:23:07')
  })

  it('zero-pads single-digit seconds', () => {
    expect(fullTime(localIso(2026, 0, 1, 0, 0, 3))).toBe('01 Jan 2026, 00:00:03')
  })
})

describe('formatSnapshotLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses smartTime for the trailing timestamp slot', () => {
    const snap: SnapshotEntry = {
      id: 's1',
      commit: 'abc',
      reason: 'manual',
      summary: 'work',
      createdAt: localIso(2026, 4, 14, 9, 5),
      hidden: false,
      files: [],
      metadata: {},
    }
    expect(formatSnapshotLabel(snap)).toBe('Manual · work · 09:05')
  })
})
