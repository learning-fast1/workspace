import { describe, expect, it } from 'vitest'
import {
  isCompletionCandidate, computeGoalSessionDelta,
  computeTodaysPlanGoals, computeGoalPriorityReason, computeNextBestAction
} from './studentDashboard.js'

const TODAY = new Date('2026-07-15T12:00:00.000Z')

function goal(overrides = {}) {
  return { id: 1, studentId: 10, status: 'active', domain: 'reading', title: 'Τ', criterion: '8/10', measurementType: 'successRatio', priority: 'medium', startDate: '2026-06-01', ...overrides }
}

function m(date, successes, attempts = 10) {
  return { date, value: { successes, attempts } }
}

// ΣΗΜΕΙΩΣΗ (Technical Plan Στάδιο 2 — Goal Wizard Step 3 redesign): το τοπικό meetsCriterion αυτού
// του αρχείου αφαιρέθηκε — η ανά-τύπο λογική ζει πλέον ΑΠΟΚΛΕΙΣΤΙΚΑ στο utils/measurementTypes/
// registry, εξαντλητικά τεσταρισμένη στο measurementTypes.test.js (και τα 8 modules, structured +
// legacy). Το isCompletionCandidate παρακάτω το καταναλώνει, χωρίς να ξέρει τίποτα για το «πώς».

describe('isCompletionCandidate (σημείο 4 — ΞΕΧΩΡΙΣΤΟ από nearCriterion)', () => {
  it('δύο συνεχόμενες μετρήσεις ≥ πραγματικό criterion → true', () => {
    const g = goal({ criterion: '8 από 10', measurementType: 'successRatio' })
    const measurements = [m('2026-07-01', 8), m('2026-07-08', 9)]
    expect(isCompletionCandidate(g, measurements)).toBe(true)
  })

  it('μόνο η πιο πρόσφατη καλύπτει το criterion, η προηγούμενη όχι → false', () => {
    const g = goal({ criterion: '8 από 10', measurementType: 'successRatio' })
    const measurements = [m('2026-07-01', 5), m('2026-07-08', 9)]
    expect(isCompletionCandidate(g, measurements)).toBe(false)
  })

  it('μόνο ΜΙΑ μέτρηση διαθέσιμη → false (χρειάζονται 2 συνεχόμενες)', () => {
    const g = goal({ criterion: '8 από 10' })
    expect(isCompletionCandidate(g, [m('2026-07-08', 9)])).toBe(false)
  })

  it('criterion δεν parse-άρεται → false, ΠΟΤΕ μαντεψιά', () => {
    const g = goal({ criterion: 'κάτι ασαφές χωρίς αριθμό' })
    const measurements = [m('2026-07-01', 10), m('2026-07-08', 10)]
    expect(isCompletionCandidate(g, measurements)).toBe(false)
  })

  it('«κοντά» (nearCriterion, goalAttention.js) ΧΩΡΙΣ πραγματική κάλυψη criterion ΔΕΝ παράγει completion candidate', () => {
    // criterion = 95% — μια μέτρηση 92% θα ήταν "κοντά" (goalAttention.js, 92>=95×0.9=85.5) αλλά
    // ΔΕΝ καλύπτει το πραγματικό 95% criterion — completion candidate απαιτεί ΠΡΑΓΜΑΤΙΚΗ κάλυψη.
    const g = goal({ criterion: '95%', measurementType: 'successRatio' })
    const measurements = [m('2026-07-01', 92, 100), m('2026-07-08', 92, 100)]
    expect(isCompletionCandidate(g, measurements)).toBe(false)
  })

  it('χρησιμοποιεί τις ΔΥΟ ΠΙΟ ΠΡΟΣΦΑΤΕΣ μετρήσεις, όχι τις δύο πρώτες χρονολογικά', () => {
    const g = goal({ criterion: '8 από 10' })
    // Παλιές μετρήσεις ήταν χαμηλές· οι δύο πιο πρόσφατες καλύπτουν το criterion.
    const measurements = [m('2026-01-01', 3), m('2026-02-01', 4), m('2026-07-01', 9), m('2026-07-08', 8)]
    expect(isCompletionCandidate(g, measurements)).toBe(true)
  })
})

describe('computeGoalSessionDelta (σημείο 7)', () => {
  it('δύο συγκρίσιμες μετρήσεις → available:true με σωστό delta/direction', () => {
    const g = goal()
    const result = computeGoalSessionDelta(g, [m('2026-07-01', 6), m('2026-07-08', 8)])
    expect(result).toMatchObject({ available: true, previousValue: 60, latestValue: 80, delta: 20, direction: 'up' })
  })

  it('πτώση τιμής → direction "down"', () => {
    const g = goal()
    const result = computeGoalSessionDelta(g, [m('2026-07-01', 8), m('2026-07-08', 6)])
    expect(result).toMatchObject({ direction: 'down', delta: -20 })
  })

  it('ίδια τιμή → direction "same", delta 0', () => {
    const g = goal()
    const result = computeGoalSessionDelta(g, [m('2026-07-01', 7), m('2026-07-08', 7)])
    expect(result).toMatchObject({ direction: 'same', delta: 0 })
  })

  it('ανεπαρκή δεδομένα (0 ή 1 έγκυρη μέτρηση) → available:false με ήρεμο μήνυμα, ΠΟΤΕ πλασματικό 0%', () => {
    const g = goal()
    expect(computeGoalSessionDelta(g, [])).toEqual({ available: false, message: 'Δεν υπάρχουν ακόμη αρκετές μετρήσεις για σύγκριση.' })
    expect(computeGoalSessionDelta(g, [m('2026-07-08', 8)])).toEqual({ available: false, message: 'Δεν υπάρχουν ακόμη αρκετές μετρήσεις για σύγκριση.' })
  })

  it('αγνοεί μετρήσεις χωρίς έγκυρη αριθμητική τιμή (π.χ. attempts:0)', () => {
    const g = goal()
    const measurements = [m('2026-07-01', 0, 0), m('2026-07-05', 8), m('2026-07-08', 9)]
    const result = computeGoalSessionDelta(g, measurements)
    expect(result.available).toBe(true)
    expect(result.previousValue).toBe(80) // 07-05, ΟΧΙ η άκυρη 07-01
    expect(result.latestValue).toBe(90)
  })

  it('αγνοεί μετρήσεις χωρίς date', () => {
    const g = goal()
    const measurements = [{ date: undefined, value: { successes: 9, attempts: 10 } }, m('2026-07-01', 5), m('2026-07-08', 7)]
    const result = computeGoalSessionDelta(g, measurements)
    expect(result).toMatchObject({ previousValue: 50, latestValue: 70 })
  })
})

describe('computeTodaysPlanGoals (σημείο 5)', () => {
  it('περιλαμβάνει ΜΟΝΟ active goals', () => {
    const goals = [goal({ id: 1, status: 'active' }), goal({ id: 2, status: 'paused' }), goal({ id: 3, status: 'achieved' }), goal({ id: 4, status: 'archived' })]
    const result = computeTodaysPlanGoals(goals)
    expect(result.map((g) => g.id)).toEqual([1])
  })

  it('paused goals ΔΕΝ εμφανίζονται ποτέ στο σημερινό πλάνο', () => {
    const goals = [goal({ id: 1, status: 'paused' })]
    expect(computeTodaysPlanGoals(goals)).toEqual([])
  })

  it('deterministic σειρά κατά id, ανεξάρτητα από τη σειρά εισόδου', () => {
    const goals = [goal({ id: 5, status: 'active' }), goal({ id: 2, status: 'active' })]
    expect(computeTodaysPlanGoals(goals).map((g) => g.id)).toEqual([2, 5])
  })
})

describe('computeGoalPriorityReason (σημείο 6)', () => {
  it('σημερινή συνεδρία υπερισχύει όλων των άλλων λόγων', () => {
    const g = goal({ priority: 'high' })
    const attention = { reasons: [{ type: 'stale', days: 20 }] }
    expect(computeGoalPriorityReason(g, { hasSessionToday: true, attention })).toBe('Προγραμματισμένος για σήμερα')
  })

  it('stale (χωρίς σημερινή συνεδρία) → το label ΑΠΟ το goalAttention.js reason, αυτούσιο', () => {
    const g = goal()
    const attention = { reasons: [{ type: 'stale', days: 16, label: 'Χωρίς μέτρηση 16 ημέρες' }] }
    expect(computeGoalPriorityReason(g, { hasSessionToday: false, attention })).toBe('Χωρίς μέτρηση 16 ημέρες')
  })

  it('nearCriterion (χωρίς stale) → το label ΑΠΟ το goalAttention.js reason, αυτούσιο', () => {
    const g = goal()
    const attention = { reasons: [{ type: 'nearCriterion', label: '96% επιτυχία' }] }
    expect(computeGoalPriorityReason(g, { hasSessionToday: false, attention })).toBe('96% επιτυχία')
  })

  it('πολλαπλά attention reasons στο ίδιο goal — stale κερδίζει έναντι nearCriterion', () => {
    const g = goal()
    const attention = { reasons: [{ type: 'nearCriterion', label: '96% επιτυχία' }, { type: 'stale', days: 15, label: 'Χωρίς μέτρηση 15 ημέρες' }] }
    expect(computeGoalPriorityReason(g, { hasSessionToday: false, attention })).toBe('Χωρίς μέτρηση 15 ημέρες')
  })

  it('χωρίς κανένα attention reason, υψηλή προτεραιότητα → «Υψηλή προτεραιότητα»', () => {
    const g = goal({ priority: 'high' })
    expect(computeGoalPriorityReason(g, { hasSessionToday: false, attention: null })).toBe('Υψηλή προτεραιότητα')
  })

  it('τίποτα δεν ισχύει → γενικό fallback', () => {
    const g = goal({ priority: 'medium' })
    expect(computeGoalPriorityReason(g, { hasSessionToday: false, attention: null })).toBe('Ενεργός στόχος')
  })
})

describe('computeNextBestAction (σημείο 3) — 5 deterministic διαδρομές', () => {
  const baseInput = (overrides = {}) => ({
    hasIncompleteSessionToday: false,
    todaySessionStudentIds: null,
    goals: [],
    datedMeasurementsByGoalId: {},
    goalEventsByGoalId: {},
    today: TODAY,
    ...overrides
  })

  it('1. σημερινή συνεδρία ανολοκλήρωτη → startSession, ΥΠΕΡΙΣΧΥΕΙ όλων των άλλων', () => {
    const g = goal({ criterion: '8/10' })
    const result = computeNextBestAction(baseInput({
      hasIncompleteSessionToday: true,
      todaySessionStudentIds: [10, 11],
      goals: [g],
      // Ακόμα κι αν ΚΑΙ completion candidate ΚΑΙ stale θα ίσχυαν, το session κερδίζει πάντα.
      datedMeasurementsByGoalId: { 1: [m('2026-06-01', 9), m('2026-06-15', 9)] }
    }))
    expect(result).toEqual({ type: 'startSession', label: 'Ξεκίνα τη συνεδρία', studentIds: [10, 11] })
  })

  it('2. completion candidate (χωρίς σημερινή συνεδρία) → reviewCompletion', () => {
    const g = goal({ id: 1, studentId: 10, criterion: '8 από 10' })
    const result = computeNextBestAction(baseInput({
      goals: [g],
      datedMeasurementsByGoalId: { 1: [m('2026-07-01', 9), m('2026-07-08', 8)] }
    }))
    expect(result).toEqual({ type: 'reviewCompletion', label: 'Εξέτασε αν ολοκληρώθηκε', goalId: 1, studentId: 10 })
  })

  it('3. stale >14 ημέρες (χωρίς session, χωρίς completion candidate) → recordMeasurement', () => {
    const g = goal({ id: 1, studentId: 10, startDate: '2026-01-01' })
    const result = computeNextBestAction(baseInput({ goals: [g], datedMeasurementsByGoalId: {} }))
    expect(result.type).toBe('recordMeasurement')
    expect(result.goalId).toBe(1)
    expect(result.studentId).toBe(10)
  })

  it('4. μηδέν goals συνολικά → createFirstGoal', () => {
    const result = computeNextBestAction(baseInput({ goals: [] }))
    expect(result).toEqual({ type: 'createFirstGoal', label: 'Δημιούργησε τον πρώτο στόχο' })
  })

  it('5. goals υπάρχουν, τίποτα δεν ταιριάζει → allCaughtUp', () => {
    const g = goal({ id: 1, studentId: 10, startDate: '2026-07-14' }) // φρέσκος, όχι stale ακόμα
    const result = computeNextBestAction(baseInput({ goals: [g], datedMeasurementsByGoalId: {} }))
    expect(result).toEqual({ type: 'allCaughtUp', label: 'Όλα ενημερωμένα — καμία άμεση ενέργεια' })
  })

  it('completion candidate κερδίζει έναντι stale όταν ΚΑΙ ΤΑ ΔΥΟ ισχύουν ταυτόχρονα σε goals', () => {
    const completionGoal = goal({ id: 2, studentId: 10, criterion: '8 από 10' })
    const staleGoal = goal({ id: 1, studentId: 10, startDate: '2026-01-01' }) // stale, καμία μέτρηση
    const result = computeNextBestAction(baseInput({
      goals: [staleGoal, completionGoal],
      datedMeasurementsByGoalId: { 2: [m('2026-07-01', 9), m('2026-07-08', 8)] }
    }))
    expect(result.type).toBe('reviewCompletion')
    expect(result.goalId).toBe(2)
  })

  it('nearCriterion (χωρίς πραγματική κάλυψη criterion) ΔΕΝ παράγει reviewCompletion — πέφτει στο επόμενο κανόνα', () => {
    // criterion 95%, μέτρηση 92% (nearCriterion-level, ΟΧΙ πραγματική κάλυψη) — παλιά ημερομηνία ώστε
    // να είναι επίσης stale, αποδεικνύοντας ότι ο κανόνας 2 ΔΕΝ πυροδοτείται εδώ.
    const g = goal({ id: 1, studentId: 10, criterion: '95%', measurementType: 'successRatio' })
    const result = computeNextBestAction(baseInput({
      goals: [g],
      datedMeasurementsByGoalId: { 1: [m('2026-06-01', 92, 100), m('2026-06-15', 92, 100)] }
    }))
    expect(result.type).toBe('recordMeasurement') // ΟΧΙ reviewCompletion
  })

  it('μεταξύ πολλαπλών stale goals, επιλέγει αυτό με τις ΠΕΡΙΣΣΟΤΕΡΕΣ ημέρες (deterministic tie-break)', () => {
    const lessStale = goal({ id: 1, studentId: 10, startDate: '2026-06-01' })
    const moreStale = goal({ id: 2, studentId: 10, startDate: '2026-01-01' })
    const result = computeNextBestAction(baseInput({ goals: [lessStale, moreStale] }))
    expect(result.goalId).toBe(2)
  })

  it('todaySessionStudentIds περνάει αυτούσιο στο αποτέλεσμα για routing προορισμού', () => {
    const result = computeNextBestAction(baseInput({ hasIncompleteSessionToday: true, todaySessionStudentIds: [10] }))
    expect(result.studentIds).toEqual([10])
  })
})
