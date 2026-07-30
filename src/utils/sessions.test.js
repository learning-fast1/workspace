import { describe, expect, it } from 'vitest'
import { selectRecentActivity } from './sessions.js'

// Sprint 8 — pure helper, unit-testable χωρίς Dexie (βλ. Technical Design Proposal, Διόρθωση 5).
describe('selectRecentActivity', () => {
  const studentById = { 1: { code: 'Μ1' }, 2: { code: 'Μ2' } }

  it('αποκλείει τη σημερινή ημέρα', () => {
    const sessions = [
      { id: 1, date: '2026-07-30', status: 'completed', studentIds: [1], durationMinutes: 30 },
      { id: 2, date: '2026-07-29', status: 'completed', studentIds: [1], durationMinutes: 30 }
    ]
    const result = selectRecentActivity(sessions, studentById, '2026-07-30')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  it('περιλαμβάνει προηγούμενες ημέρες κανονικά', () => {
    const sessions = [
      { id: 1, date: '2026-07-29', status: 'completed', studentIds: [1], durationMinutes: 30 },
      { id: 2, date: '2026-07-28', status: 'completed', studentIds: [2], durationMinutes: 45 }
    ]
    const result = selectRecentActivity(sessions, studentById, '2026-07-30')
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual([1, 2])
  })

  it('αποκλείει notHeld συνεδρίες', () => {
    const sessions = [
      { id: 1, date: '2026-07-29', status: 'notHeld', studentIds: [1], durationMinutes: null },
      { id: 2, date: '2026-07-29', status: 'completed', studentIds: [1], durationMinutes: 30 }
    ]
    const result = selectRecentActivity(sessions, studentById, '2026-07-30')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  it('περιορίζει στο δοθέν limit', () => {
    const sessions = [1, 2, 3, 4, 5, 6].map((n) => ({
      id: n,
      date: `2026-07-${20 + n}`,
      status: 'completed',
      studentIds: [1],
      durationMinutes: 30
    }))
    const result = selectRecentActivity(sessions, studentById, '2026-07-30', 5)
    expect(result).toHaveLength(5)
  })

  it('μορφοποιεί studentLabel από κωδικούς μαθητών, με fallback «—» όταν λείπουν', () => {
    const sessions = [{ id: 1, date: '2026-07-29', status: 'completed', studentIds: [1, 2], durationMinutes: 30 }]
    const result = selectRecentActivity(sessions, studentById, '2026-07-30')
    expect(result[0].studentLabel).toBe('Μ1, Μ2')

    const missing = selectRecentActivity(
      [{ id: 2, date: '2026-07-29', status: 'completed', studentIds: [999], durationMinutes: 30 }],
      studentById,
      '2026-07-30'
    )
    expect(missing[0].studentLabel).toBe('—')
  })
})
