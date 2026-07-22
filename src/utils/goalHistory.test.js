import { describe, expect, it } from 'vitest'
import { buildGoalHistoryFeed } from './goalHistory.js'

function baseGoal(overrides = {}) {
  return { id: 1, title: 'Στόχος Α', measurementType: 'successRatio', criterionConfig: null, ...overrides }
}

describe('buildGoalHistoryFeed — ενοποιημένο, flat, αντίστροφα χρονολογικό feed', () => {
  it('συγχωνεύει goalEvents + measurements, ταξινομημένα αντίστροφα χρονολογικά', () => {
    const goal = baseGoal()
    const goalEvents = [
      { id: 1, goalId: 1, at: '2026-01-01T10:00:00.000Z', type: 'created', fromStatus: null, toStatus: 'active', note: '', trigger: 'manual' }
    ]
    const measurements = [
      { id: 1, goalId: 1, sessionId: 100, value: { successes: 4, attempts: 5 } }
    ]
    const sessionDateById = { 100: '2026-02-01' }

    const feed = buildGoalHistoryFeed(goal, { goalEvents, measurements, sessionDateById })

    expect(feed).toHaveLength(2)
    // Πιο πρόσφατα πρώτα: η συνεδρία (2026-02-01) πριν το goalEvent δημιουργίας (2026-01-01).
    expect(feed[0].date).toBe('2026-02-01')
    expect(feed[1].date).toBe('2026-01-01')
  })

  it('measurement entry: χρησιμοποιεί formatRecordedValue (registry), ΟΧΙ τον παλιό formatter', () => {
    const goal = baseGoal({ measurementType: 'successRatio' })
    const measurements = [{ id: 1, goalId: 1, sessionId: 100, value: { successes: 3, attempts: 4 } }]
    const feed = buildGoalHistoryFeed(goal, { measurements, sessionDateById: { 100: '2026-02-01' } })

    expect(feed).toHaveLength(1)
    expect(feed[0].kind).toBe('measurement')
    expect(feed[0].text).toContain('3/4')
    expect(feed[0].sessionId).toBe(100)
  })

  it('ορφανή μέτρηση (η συνεδρία δεν βρίσκεται πια στο sessionDateById) παραλείπεται σιωπηλά, ΔΕΝ πετάει', () => {
    const goal = baseGoal()
    const measurements = [{ id: 1, goalId: 1, sessionId: 999, value: { successes: 1, attempts: 1 } }]

    expect(() => buildGoalHistoryFeed(goal, { measurements, sessionDateById: {} })).not.toThrow()
    expect(buildGoalHistoryFeed(goal, { measurements, sessionDateById: {} })).toHaveLength(0)
  })

  it('καμία είσοδος → άδειο array, ΟΧΙ throw', () => {
    expect(buildGoalHistoryFeed(baseGoal(), {})).toEqual([])
  })
})
