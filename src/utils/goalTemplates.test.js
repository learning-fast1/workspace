import { describe, expect, it } from 'vitest'
import { prefillFromSource, GOAL_TEMPLATE_FIELDS } from './goalTemplates.js'

describe('prefillFromSource — copy-on-use ανεξαρτησία (Technical Plan Στάδιο 6, σημείο 4)', () => {
  it('από πηγή σε σχήμα goalTemplates — αντιγράφει τα σωστά πεδία, baseline πάντα κενό', () => {
    const template = { id: 1, domain: 'reading', title: 'Ανάγνωση', description: 'περιγρ', criterion: '8/10', measurementType: 'successRatio' }
    const result = prefillFromSource(template)
    expect(result).toEqual({ domain: 'reading', title: 'Ανάγνωση', description: 'περιγρ', criterion: '8/10', measurementType: 'successRatio', baseline: '' })
  })

  it('από πηγή σε σχήμα πλήρους goals row (copy-to-another-student, Στάδιο 7) — baseline ΠΑΝΤΑ καθαρίζεται', () => {
    const sourceGoal = {
      id: 5, studentId: 42, domain: 'math', title: 'Πρόσθεση', description: '', criterion: '5/5',
      measurementType: 'successRatio', baseline: 'Μετράει ως το 10 — ΕΥΑΙΣΘΗΤΟ, ΜΗ αντιγραφεί',
      status: 'active', statusChangedAt: '2026-01-01T00:00:00.000Z', priority: 'high', startDate: '2026-01-01'
    }
    const result = prefillFromSource(sourceGoal)
    expect(result.baseline).toBe('')
    // ΜΟΝΟ τα whitelisted πεδία + baseline υπάρχουν στο αποτέλεσμα — καμία διαρροή studentId/status/κλπ.
    expect(Object.keys(result).sort()).toEqual([...GOAL_TEMPLATE_FIELDS, 'baseline'].sort())
    expect(result.studentId).toBeUndefined()
    expect(result.status).toBeUndefined()
    expect(result.statusChangedAt).toBeUndefined()
    expect(result.priority).toBeUndefined()
    expect(result.startDate).toBeUndefined()
  })

  it('ΔΕΝ μεταλλάσσει το source object', () => {
    const source = { domain: 'reading', title: 'Τ', description: '', criterion: '', measurementType: '', baseline: 'κάτι', extra: 'μένει ανέπαφο' }
    const snapshot = JSON.stringify(source)
    prefillFromSource(source)
    expect(JSON.stringify(source)).toBe(snapshot)
  })

  it('το αποτέλεσμα είναι ΝΕΟ αντικείμενο — μετάλλαξή του δεν επηρεάζει το source', () => {
    const source = { domain: 'reading', title: 'Αρχικός τίτλος', description: '', criterion: '', measurementType: '', baseline: '' }
    const result = prefillFromSource(source)
    result.title = 'Αλλαγμένος'
    expect(source.title).toBe('Αρχικός τίτλος')
  })

  it('δύο ξεχωριστές κλήσεις με το ίδιο source επιστρέφουν ΑΝΕΞΑΡΤΗΤΑ αντικείμενα', () => {
    const source = { domain: 'reading', title: 'Τ', description: '', criterion: '', measurementType: '', baseline: '' }
    const result1 = prefillFromSource(source)
    const result2 = prefillFromSource(source)
    expect(result1).not.toBe(result2) // διαφορετικές αναφορές
    result1.title = 'Άλλαξε μόνο το πρώτο'
    expect(result2.title).toBe('Τ') // το δεύτερο ανεπηρέαστο
  })

  it('λείποντα πεδία στο source → κενά strings, όχι undefined/null', () => {
    const result = prefillFromSource({ domain: 'reading' })
    expect(result.title).toBe('')
    expect(result.description).toBe('')
    expect(result.criterion).toBe('')
    expect(result.measurementType).toBe('')
    expect(result.baseline).toBe('')
  })
})
