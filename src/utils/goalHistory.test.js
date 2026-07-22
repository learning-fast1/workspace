import { describe, expect, it } from 'vitest'
import { buildGoalHistoryFeed } from './goalHistory.js'

function baseGoal(overrides = {}) {
  return { id: 1, title: 'Στόχος Α', measurementType: 'successRatio', criterionConfig: null, ...overrides }
}

describe('buildGoalHistoryFeed — ενοποιημένο, flat, αντίστροφα χρονολογικό feed', () => {
  it('συγχωνεύει goalEvents + measurements + assessments, ταξινομημένα αντίστροφα χρονολογικά', () => {
    const goal = baseGoal()
    const goalEvents = [
      { id: 1, goalId: 1, at: '2026-01-01T10:00:00.000Z', type: 'created', fromStatus: null, toStatus: 'active', note: '', trigger: 'manual' }
    ]
    const measurements = [
      { id: 1, goalId: 1, sessionId: 100, value: { successes: 4, attempts: 5 } }
    ]
    const assessments = [
      { id: 1, goalId: 1, sessionId: 100, rating: 'improved', note: 'Καλή μέρα' }
    ]
    const sessionDateById = { 100: '2026-02-01' }

    const feed = buildGoalHistoryFeed(goal, { goalEvents, measurements, assessments, sessionDateById })

    expect(feed).toHaveLength(3)
    // Πιο πρόσφατα πρώτα: η συνεδρία (2026-02-01) πριν το goalEvent δημιουργίας (2026-01-01).
    expect(feed[0].date).toBe('2026-02-01')
    expect(feed[2].date).toBe('2026-01-01')
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

  it('assessment entry (μη-mastered): δείχνει ετικέτα + note, kind assessment', () => {
    const goal = baseGoal()
    const assessments = [{ id: 1, goalId: 1, sessionId: 100, rating: 'worsened', note: 'Δύσκολη μέρα' }]
    const feed = buildGoalHistoryFeed(goal, { assessments, sessionDateById: { 100: '2026-02-01' } })

    expect(feed).toHaveLength(1)
    expect(feed[0].kind).toBe('assessment')
    expect(feed[0].text).toBe('Χειροτέρεψε — «Δύσκολη μέρα»')
    expect(feed[0].sessionId).toBe(100)
  })

  it('assessment entry χωρίς note: δείχνει μόνο την ετικέτα', () => {
    const goal = baseGoal()
    const assessments = [{ id: 1, goalId: 1, sessionId: 100, rating: 'stable', note: '' }]
    const feed = buildGoalHistoryFeed(goal, { assessments, sessionDateById: { 100: '2026-02-01' } })

    expect(feed[0].text).toBe('Σταθερός')
  })

  it('«Κατακτήθηκε»: assessment + matching goalEvent (ίδιο sessionId, trigger teachingMode) συγχωνεύονται σε ΜΙΑ γραμμή', () => {
    const goal = baseGoal()
    const goalEvents = [
      {
        id: 5, goalId: 1, at: '2026-03-01T12:00:00.000Z', type: 'statusChanged',
        fromStatus: 'active', toStatus: 'achieved', note: 'Πέτυχε το κριτήριο', trigger: 'teachingMode', sessionId: 200
      }
    ]
    const assessments = [{ id: 9, goalId: 1, sessionId: 200, rating: 'mastered', note: 'Πέτυχε το κριτήριο' }]
    const sessionDateById = { 200: '2026-03-01' }

    const feed = buildGoalHistoryFeed(goal, { goalEvents, assessments, sessionDateById })

    expect(feed).toHaveLength(1) // ΟΧΙ 2 — συγχωνεύτηκαν
    expect(feed[0].key).toBe('goal-event-5')
    expect(feed[0].text).toBe('Κατακτήθηκε — ο στόχος ολοκληρώθηκε επίσημα — «Πέτυχε το κριτήριο»')
    expect(feed[0].sessionId).toBe(200)
  })

  it('«Κατακτήθηκε» ΧΩΡΙΣ ταιριαστό goalEvent (π.χ. λείπει sessionId, παλιά εγγραφή) → ασφαλές fallback σε 2 ξεχωριστές γραμμές', () => {
    const goal = baseGoal()
    const goalEvents = [
      { id: 5, goalId: 1, at: '2026-03-01T12:00:00.000Z', type: 'statusChanged', fromStatus: 'active', toStatus: 'achieved', note: '', trigger: 'teachingMode', sessionId: null }
    ]
    const assessments = [{ id: 9, goalId: 1, sessionId: 200, rating: 'mastered', note: '' }]
    const sessionDateById = { 200: '2026-03-01' }

    const feed = buildGoalHistoryFeed(goal, { goalEvents, assessments, sessionDateById })

    expect(feed).toHaveLength(2)
  })

  it('ορφανή μέτρηση/εκτίμηση (η συνεδρία δεν βρίσκεται πια στο sessionDateById) παραλείπεται σιωπηλά, ΔΕΝ πετάει', () => {
    const goal = baseGoal()
    const measurements = [{ id: 1, goalId: 1, sessionId: 999, value: { successes: 1, attempts: 1 } }]
    const assessments = [{ id: 1, goalId: 1, sessionId: 999, rating: 'stable', note: '' }]

    expect(() => buildGoalHistoryFeed(goal, { measurements, assessments, sessionDateById: {} })).not.toThrow()
    expect(buildGoalHistoryFeed(goal, { measurements, assessments, sessionDateById: {} })).toHaveLength(0)
  })

  it('καμία είσοδος → άδειο array, ΟΧΙ throw', () => {
    expect(buildGoalHistoryFeed(baseGoal(), {})).toEqual([])
  })
})
