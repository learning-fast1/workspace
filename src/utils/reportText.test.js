import { describe, expect, it } from 'vitest'
import { generateReportText } from './reportText.js'

const student = { id: 1, code: 'Μ1', nickname: '' }

function baseArgs(overrides = {}) {
  return {
    student,
    dateFrom: '2026-01-01',
    dateTo: '2026-06-30',
    goals: [],
    sessions: [],
    measurements: [],
    observations: [],
    ...overrides
  }
}

describe('generateReportText — παρουσίες/απουσίες', () => {
  it('μετράει μόνο τις συνεδρίες όπου ο μαθητής ήταν παρών', () => {
    const sessions = [
      { id: 1, date: '2026-01-05', studentIds: [1], durationMinutes: 20, absentStudentIds: [] },
      { id: 2, date: '2026-01-12', studentIds: [1], durationMinutes: 10, absentStudentIds: [1] },
      { id: 3, date: '2026-01-19', studentIds: [1], durationMinutes: 40, absentStudentIds: [] }
    ]
    const text = generateReportText(baseArgs({ sessions }))
    expect(text).toContain('Συνεδρίες: 2')
    expect(text).toContain('Συνολικός χρόνος στήριξης: 60 λεπτά')
    expect(text).toContain('Απουσίες: 1')
  })

  it('δεν εμφανίζει γραμμή απουσιών όταν δεν υπάρχουν', () => {
    const sessions = [{ id: 1, date: '2026-01-05', studentIds: [1], durationMinutes: 20, absentStudentIds: [] }]
    const text = generateReportText(baseArgs({ sessions }))
    expect(text).not.toContain('Απουσίες')
  })
})

describe('generateReportText — πορεία στόχου', () => {
  const goal = {
    id: 1,
    domain: 'reading',
    title: 'Ανάγνωση προτάσεων',
    baseline: 'Διαβάζει συλλαβιστά',
    criterion: '4 από 5 προσπάθειες',
    measurementType: 'successRatio',
    status: 'active',
    startDate: '2025-09-01'
  }
  const sessions = [
    { id: 1, date: '2026-01-05', studentIds: [1], durationMinutes: 20, absentStudentIds: [] },
    { id: 2, date: '2026-02-05', studentIds: [1], durationMinutes: 20, absentStudentIds: [] }
  ]

  it('αναγνωρίζει βελτίωση μεταξύ πρώτης και τελευταίας μέτρησης', () => {
    const measurements = [
      { id: 1, sessionId: 1, goalId: 1, value: { successes: 1, attempts: 4 } },
      { id: 2, sessionId: 2, goalId: 1, value: { successes: 3, attempts: 4 } }
    ]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).toContain('Πορεία: Βελτίωση από 1/4 (25%) σε 3/4 (75%).')
  })

  it('αναγνωρίζει επίτευξη κριτηρίου όταν η τελευταία μέτρηση το καλύπτει', () => {
    const measurements = [
      { id: 1, sessionId: 1, goalId: 1, value: { successes: 1, attempts: 4 } },
      { id: 2, sessionId: 2, goalId: 1, value: { successes: 4, attempts: 5 } }
    ]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).toContain('Κριτήριο: 4 από 5 προσπάθειες — Επιτεύχθηκε.')
  })

  it('αναγνωρίζει μη επίτευξη κριτηρίου', () => {
    const measurements = [{ id: 1, sessionId: 1, goalId: 1, value: { successes: 1, attempts: 5 } }]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).toContain('Κριτήριο: 4 από 5 προσπάθειες — Δεν έχει επιτευχθεί ακόμα.')
  })

  it('αναφέρει έλλειψη μετρήσεων για ενεργό στόχο χωρίς δραστηριότητα', () => {
    const text = generateReportText(baseArgs({ goals: [goal], sessions }))
    expect(text).toContain('Δεν καταγράφηκαν μετρήσεις στην περίοδο.')
  })
})

describe('generateReportText — ταξινόμηση τομέων/στόχων', () => {
  it('εμφανίζει τους τομείς με τη σταθερή σειρά του domains.js, όχι με τη σειρά δημιουργίας των στόχων', () => {
    const goals = [
      { id: 1, domain: 'behavior', title: 'Στόχος συμπεριφοράς', status: 'active', startDate: '2026-01-01', priority: 'medium' },
      { id: 2, domain: 'fine-motor', title: 'Στόχος λεπτής κινητικότητας', status: 'active', startDate: '2026-01-01', priority: 'medium' },
      { id: 3, domain: 'reading', title: 'Στόχος ανάγνωσης', status: 'active', startDate: '2026-01-01', priority: 'medium' }
    ]
    const text = generateReportText(baseArgs({ goals }))
    const fineMotorIndex = text.indexOf('## Λεπτή κινητικότητα')
    const readingIndex = text.indexOf('## Ανάγνωση')
    const behaviorIndex = text.indexOf('## Συμπεριφορά')
    expect(fineMotorIndex).toBeGreaterThan(-1)
    expect(fineMotorIndex).toBeLessThan(readingIndex)
    expect(readingIndex).toBeLessThan(behaviorIndex)
  })

  it('εμφανίζει πρώτα τους στόχους υψηλής προτεραιότητας μέσα σε έναν τομέα', () => {
    const goals = [
      { id: 1, domain: 'reading', title: 'Χαμηλής προτεραιότητας', status: 'active', startDate: '2026-01-01', priority: 'low' },
      { id: 2, domain: 'reading', title: 'Υψηλής προτεραιότητας', status: 'active', startDate: '2026-01-01', priority: 'high' }
    ]
    const text = generateReportText(baseArgs({ goals }))
    const highIndex = text.indexOf('Υψηλής προτεραιότητας')
    const lowIndex = text.indexOf('Χαμηλής προτεραιότητας')
    expect(highIndex).toBeGreaterThan(-1)
    expect(highIndex).toBeLessThan(lowIndex)
  })
})

describe('generateReportText — παρατηρήσεις', () => {
  it('φέρνει τις παρατηρήσεις-milestone πρώτες', () => {
    const observations = [
      { id: 1, date: '2026-01-10', text: 'Απλή παρατήρηση', milestone: false },
      { id: 2, date: '2026-01-05', text: 'Σημαντική στιγμή', milestone: true }
    ]
    const text = generateReportText(baseArgs({ observations }))
    const milestoneIndex = text.indexOf('Σημαντική στιγμή')
    const plainIndex = text.indexOf('Απλή παρατήρηση')
    expect(milestoneIndex).toBeGreaterThan(-1)
    expect(milestoneIndex).toBeLessThan(plainIndex)
  })

  it('αγνοεί παρατηρήσεις εκτός περιόδου', () => {
    const observations = [{ id: 1, date: '2020-01-01', text: 'Παλιά παρατήρηση', milestone: false }]
    const text = generateReportText(baseArgs({ observations }))
    expect(text).not.toContain('Παλιά παρατήρηση')
  })
})
