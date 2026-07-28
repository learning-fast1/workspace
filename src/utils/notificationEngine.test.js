import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_STATE_SCHEMA_VERSION,
  computeCandidateNotifications,
  isSuppressed,
  filterVisibleNotifications,
  sortNotifications
} from './notificationEngine.js'

const today = '2026-07-28'

function entry(overrides = {}) {
  return {
    studentId: 1,
    goals: [],
    datedMeasurementsByGoalId: {},
    goalEventsByGoalId: {},
    reports: [],
    pastEntries: [],
    ...overrides
  }
}

describe('computeCandidateNotifications — goalStale (reuse goalAttention.js, καμία αντιγραφή)', () => {
  it('goal active, χωρίς μέτρηση >14 ημέρες → goalStale notification με deterministic id βασισμένο στο since', () => {
    const goal = { id: 100, studentId: 1, title: 'Στόχος Α', status: 'active', startDate: '2020-01-01' }
    const results = computeCandidateNotifications([entry({ goals: [goal] })], { sessionsByDate: {}, today })
    const notification = results.find((n) => n.type === 'goalStale')
    expect(notification).toBeTruthy()
    expect(notification.id).toBe(`goalStale:100:2020-01-01`)
    expect(notification.severity).toBe('warning')
    expect(notification.entityType).toBe('goal')
    expect(notification.entityId).toBe(100)
    expect(notification.studentId).toBe(1)
    expect(notification.primaryAction).toEqual({ type: 'openGoal', studentId: 1, goalId: 100 })
    expect(notification.dismissible).toBe(true)
    expect(notification.snoozable).toBe(true)
  })

  it('goal active, ΠΡΟΣΦΑΤΗ μέτρηση → καμία goalStale notification', () => {
    const goal = { id: 100, studentId: 1, title: 'Στόχος Α', status: 'active', startDate: '2020-01-01', measurementType: 'successRatio' }
    const measurements = { 100: [{ id: 5, date: '2026-07-27', goalId: 100, value: { successes: 1, attempts: 1 } }] }
    const results = computeCandidateNotifications([entry({ goals: [goal], datedMeasurementsByGoalId: measurements })], { sessionsByDate: {}, today })
    expect(results.find((n) => n.type === 'goalStale')).toBeUndefined()
  })
})

describe('computeCandidateNotifications — goalPausedTooLong (reuse goalAttention.js)', () => {
  it('goal paused πάνω από 42 μέρες (goalEvents) → notification, id βασισμένο στο since', () => {
    const goal = { id: 200, studentId: 1, title: 'Στόχος Β', status: 'paused' }
    const goalEvents = { 200: [{ goalId: 200, type: 'statusChanged', toStatus: 'paused', at: '2020-01-01T00:00:00.000Z' }] }
    const results = computeCandidateNotifications([entry({ goals: [goal], goalEventsByGoalId: goalEvents })], { sessionsByDate: {}, today })
    const notification = results.find((n) => n.type === 'goalPausedTooLong')
    expect(notification).toBeTruthy()
    expect(notification.id).toBe('goalPausedTooLong:200:2020-01-01')
    expect(notification.severity).toBe('warning')
  })
})

describe('computeCandidateNotifications — goalNearCriterion (reuse goalAttention.js) — id αγκυρωμένο στην τελευταία μέτρηση', () => {
  it('goal near criterion → notification id αλλάζει όταν αλλάζει η τελευταία μέτρηση', () => {
    const goal = { id: 300, studentId: 1, title: 'Στόχος Γ', status: 'active', measurementType: 'successRatio', criterionConfig: { targetSuccesses: 80, targetAttempts: 100 } }
    const measurements = { 300: [{ id: 9, date: '2026-07-27', goalId: 300, value: { successes: 78, attempts: 100 } }] }
    const results = computeCandidateNotifications([entry({ goals: [goal], datedMeasurementsByGoalId: measurements })], { sessionsByDate: {}, today })
    const notification = results.find((n) => n.type === 'goalNearCriterion')
    expect(notification).toBeTruthy()
    expect(notification.id).toBe('goalNearCriterion:300:9')
    expect(notification.severity).toBe('positive')
  })
})

describe('computeCandidateNotifications — goalCompletionCandidate (reuse studentDashboard.js, ΞΕΧΩΡΙΣΤΟ από nearCriterion)', () => {
  it('2 συνεχόμενες μετρήσεις που καλύπτουν το criterion → notification, ΜΟΝΟ active goals', () => {
    const goal = { id: 400, studentId: 1, title: 'Στόχος Δ', status: 'active', measurementType: 'successRatio', criterionConfig: { targetSuccesses: 80, targetAttempts: 100 } }
    const measurements = {
      400: [
        { id: 20, date: '2026-07-20', goalId: 400, value: { successes: 85, attempts: 100 } },
        { id: 21, date: '2026-07-27', goalId: 400, value: { successes: 90, attempts: 100 } }
      ]
    }
    const results = computeCandidateNotifications([entry({ goals: [goal], datedMeasurementsByGoalId: measurements })], { sessionsByDate: {}, today })
    const notification = results.find((n) => n.type === 'goalCompletionCandidate')
    expect(notification).toBeTruthy()
    expect(notification.id).toBe('goalCompletionCandidate:400:21')
    expect(notification.severity).toBe('positive')
    expect(notification.primaryAction).toEqual({ type: 'openGoal', studentId: 1, goalId: 400 })
  })

  it('goal paused (ΟΧΙ active) με ίδια μετρήσεις → ΚΑΜΙΑ completion candidate notification', () => {
    const goal = { id: 400, studentId: 1, title: 'Στόχος Δ', status: 'paused', measurementType: 'successRatio', criterionConfig: { targetSuccesses: 80, targetAttempts: 100 } }
    const measurements = {
      400: [
        { id: 20, date: '2026-07-20', goalId: 400, value: { successes: 85, attempts: 100 } },
        { id: 21, date: '2026-07-27', goalId: 400, value: { successes: 90, attempts: 100 } }
      ]
    }
    const results = computeCandidateNotifications([entry({ goals: [goal], datedMeasurementsByGoalId: measurements })], { sessionsByDate: {}, today })
    expect(results.find((n) => n.type === 'goalCompletionCandidate')).toBeUndefined()
  })
})

describe('computeCandidateNotifications — draftReport (reuse queueAttention.js)', () => {
  it('draft report → notification, entityId = πρώτο draft report id', () => {
    const reports = [{ id: 7, studentId: 1, status: 'draft' }, { id: 8, studentId: 1, status: 'final' }]
    const results = computeCandidateNotifications([entry({ reports })], { sessionsByDate: {}, today })
    const notification = results.find((n) => n.type === 'draftReport')
    expect(notification).toBeTruthy()
    expect(notification.id).toBe('draftReport:1:7')
    expect(notification.entityType).toBe('report')
    expect(notification.entityId).toBe(7)
    expect(notification.primaryAction).toEqual({ type: 'openStudent', studentId: 1, activeTab: 'report' })
  })

  it('κανένα draft report → καμία notification', () => {
    const reports = [{ id: 8, studentId: 1, status: 'final' }]
    const results = computeCandidateNotifications([entry({ reports })], { sessionsByDate: {}, today })
    expect(results.find((n) => n.type === 'draftReport')).toBeUndefined()
  })
})

describe('computeCandidateNotifications — unresolvedSession (reuse queueAttention.js)', () => {
  it('past pending entry χωρίς session → notification, id αγκυρωμένο στην πιο πρόσφατη εκκρεμή ημερομηνία', () => {
    const pastEntries = [{ date: '2026-07-25', studentIds: [1], status: 'pending' }]
    const results = computeCandidateNotifications([entry({ pastEntries })], { sessionsByDate: {}, today })
    const notification = results.find((n) => n.type === 'unresolvedSession')
    expect(notification).toBeTruthy()
    expect(notification.id).toBe('unresolvedSession:1:2026-07-25')
    expect(notification.entityType).toBe('student')
    expect(notification.primaryAction).toEqual({ type: 'openStudent', studentId: 1 })
  })
})

describe('isSuppressed', () => {
  it('χωρίς state row → ορατό', () => {
    expect(isSuppressed(null, today)).toBe(false)
  })

  it('dismissedAt → κρυμμένο', () => {
    expect(isSuppressed({ dismissedAt: '2026-07-01T00:00:00.000Z', schemaVersion: NOTIFICATION_STATE_SCHEMA_VERSION }, today)).toBe(true)
  })

  it('snoozedUntil στο ΜΕΛΛΟΝ → κρυμμένο', () => {
    expect(isSuppressed({ snoozedUntil: '2026-08-01', schemaVersion: NOTIFICATION_STATE_SCHEMA_VERSION }, today)).toBe(true)
  })

  it('snoozedUntil ΠΕΡΑΣΜΕΝΟ (review χρήστη: ξαναγίνεται ορατό, ΟΧΙ διαγραφή) → ορατό', () => {
    expect(isSuppressed({ snoozedUntil: '2026-07-01', schemaVersion: NOTIFICATION_STATE_SCHEMA_VERSION }, today)).toBe(false)
  })

  it('state row με ΔΙΑΦΟΡΕΤΙΚΟ schemaVersion (review χρήστη, σημείο 2) → αγνοείται, ορατό', () => {
    expect(isSuppressed({ dismissedAt: '2026-07-01T00:00:00.000Z', schemaVersion: 999 }, today)).toBe(false)
  })
})

describe('filterVisibleNotifications', () => {
  it('αφαιρεί dismissed/ενεργά snoozed, κρατάει ό,τι δεν έχει state ή έχει λήξει το snooze', () => {
    const candidates = [
      { id: 'a', studentId: 1 },
      { id: 'b', studentId: 1 },
      { id: 'c', studentId: 1 }
    ]
    const stateById = {
      a: { dismissedAt: '2026-07-01T00:00:00.000Z', schemaVersion: NOTIFICATION_STATE_SCHEMA_VERSION },
      b: { snoozedUntil: '2026-07-01', schemaVersion: NOTIFICATION_STATE_SCHEMA_VERSION } // ληγμένο
    }
    const visible = filterVisibleNotifications(candidates, stateById, today)
    expect(visible.map((n) => n.id)).toEqual(['b', 'c'])
  })
})

describe('sortNotifications', () => {
  it('warning πριν info πριν positive, μετά studentId, μετά id', () => {
    const notifications = [
      { id: 'z', severity: 'positive', studentId: 1 },
      { id: 'a', severity: 'warning', studentId: 2 },
      { id: 'm', severity: 'info', studentId: 1 },
      { id: 'b', severity: 'warning', studentId: 1 }
    ]
    const sorted = sortNotifications(notifications)
    expect(sorted.map((n) => n.id)).toEqual(['b', 'a', 'm', 'z'])
  })
})
