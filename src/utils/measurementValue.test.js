import { describe, expect, it } from 'vitest'
import {
  formatMeasurementValue, measurementNumericValue, parseCriterionTarget,
  latestDatedMeasurement
} from './measurementValue.js'

describe('measurementNumericValue', () => {
  it('υπολογίζει ποσοστό επιτυχίας', () => {
    expect(measurementNumericValue('successRatio', { successes: 3, attempts: 4 })).toBe(75)
  })

  it('επιστρέφει null αν δεν υπάρχουν προσπάθειες', () => {
    expect(measurementNumericValue('successRatio', { successes: 0, attempts: 0 })).toBe(null)
  })

  it('μεταφράζει επίπεδο υποβοήθησης σε αριθμητική διαβάθμιση', () => {
    expect(measurementNumericValue('promptLevel', { level: 'independent' })).toBe(3)
    expect(measurementNumericValue('promptLevel', { level: 'physical' })).toBe(1)
  })

  it('επιστρέφει τα λεπτά για τύπο duration', () => {
    expect(measurementNumericValue('duration', { minutes: 12 })).toBe(12)
  })

  it('επιστρέφει τα βήματα για τύπο taskAnalysis', () => {
    expect(measurementNumericValue('taskAnalysis', { stepsCompleted: 5 })).toBe(5)
  })

  it('επιστρέφει null όταν λείπει η τιμή', () => {
    expect(measurementNumericValue('successRatio', null)).toBe(null)
  })
})

describe('formatMeasurementValue', () => {
  it('διατυπώνει το successRatio ως κλάσμα με ποσοστό', () => {
    expect(formatMeasurementValue('successRatio', { successes: 3, attempts: 4 })).toBe('3/4 (75%)')
  })

  it('επιστρέφει παύλα όταν δεν υπάρχει τιμή', () => {
    expect(formatMeasurementValue('successRatio', null)).toBe('—')
  })
})

describe('parseCriterionTarget', () => {
  it('αναγνωρίζει «Χ από Υ» ως ποσοστό', () => {
    expect(parseCriterionTarget('4 από 5 προσπάθειες', 'successRatio')).toBe(80)
  })

  it('αναγνωρίζει «Χ στα Υ»', () => {
    expect(parseCriterionTarget('8 στα 10', 'successRatio')).toBe(80)
  })

  it('αναγνωρίζει «Χ στις Υ»', () => {
    expect(parseCriterionTarget('9 στις 10 φορές', 'successRatio')).toBe(90)
  })

  it('αναγνωρίζει ρητό ποσοστό', () => {
    expect(parseCriterionTarget('80% επιτυχία', 'successRatio')).toBe(80)
  })

  it('αναγνωρίζει λεπτά για duration', () => {
    expect(parseCriterionTarget('Για 10 συνεχόμενα λεπτά', 'duration')).toBe(10)
  })

  it('αναγνωρίζει βήματα για taskAnalysis', () => {
    expect(parseCriterionTarget('5 βήματα ανεξάρτητα', 'taskAnalysis')).toBe(5)
  })

  it('αναγνωρίζει «ανεξάρτητα» για promptLevel', () => {
    expect(parseCriterionTarget('Ανεξάρτητα σε 3 συνεδρίες', 'promptLevel')).toBe(3)
  })

  it('επιστρέφει null όταν δεν αναγνωρίζεται μοτίβο', () => {
    expect(parseCriterionTarget('κάτι ασαφές', 'successRatio')).toBe(null)
  })

  it('επιστρέφει null όταν λείπει το κριτήριο', () => {
    expect(parseCriterionTarget('', 'successRatio')).toBe(null)
    expect(parseCriterionTarget(null, 'successRatio')).toBe(null)
  })
})

describe('latestDatedMeasurement (Sprint 7 Στάδιο 8 — εξήχθη από GoalsList.jsx)', () => {
  it('βρίσκει τη μέτρηση με το πιο πρόσφατο date', () => {
    const measurements = [
      { id: 1, date: '2026-01-01', value: { successes: 1, attempts: 2 } },
      { id: 2, date: '2026-03-01', value: { successes: 3, attempts: 4 } },
      { id: 3, date: '2026-02-01', value: { successes: 2, attempts: 3 } }
    ]
    expect(latestDatedMeasurement(measurements).id).toBe(2)
  })

  it('αγνοεί μετρήσεις χωρίς date', () => {
    const measurements = [{ id: 1, date: undefined }, { id: 2, date: '2026-01-01' }]
    expect(latestDatedMeasurement(measurements).id).toBe(2)
  })

  it('null όταν καμία μέτρηση δεν έχει date (ή άδειο array)', () => {
    expect(latestDatedMeasurement([])).toBe(null)
    expect(latestDatedMeasurement([{ id: 1, date: undefined }])).toBe(null)
  })

  it('ΔΕΝ μεταλλάσσει το input array (immutable)', () => {
    const measurements = [{ id: 1, date: '2026-02-01' }, { id: 2, date: '2026-01-01' }]
    const snapshot = JSON.stringify(measurements)
    latestDatedMeasurement(measurements)
    expect(JSON.stringify(measurements)).toBe(snapshot)
  })
})

// computeProgressPercent (το παλιό, 3-ορισμάτων) αφαιρέθηκε στο Technical Plan Στάδιο 9α — το
// GoalsList.jsx (μοναδικός caller, repo-wide επιβεβαιωμένο) καλεί πλέον αποκλειστικά το
// utils/measurementTypes/index.js. Η ισοδύναμη κάλυψη (συμπεριλαμβανομένου του regression για το
// promptLevel pseudo-progress) ζει πλέον στο src/utils/measurementTypes/measurementTypes.test.js.
