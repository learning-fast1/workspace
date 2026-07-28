import { describe, expect, it } from 'vitest'
import {
  UNRESOLVED_ENTRY_LOOKBACK_DAYS,
  groupByStudentIdField,
  groupEntriesByStudentId,
  groupSessionsByDate,
  unresolvedSessionReason,
  draftReportReason,
  computeQueueRowAttention,
  mergeQueueRowAttention
} from './queueAttention.js'
import { addDays } from './date.js'

const today = '2026-07-28'

describe('groupByStudentIdField', () => {
  it('ομαδοποιεί items με μοναδικό πεδίο studentId', () => {
    const goals = [{ id: 1, studentId: 10 }, { id: 2, studentId: 10 }, { id: 3, studentId: 20 }]
    const grouped = groupByStudentIdField(goals)
    expect(grouped[10]).toHaveLength(2)
    expect(grouped[20]).toHaveLength(1)
  })
})

describe('groupEntriesByStudentId', () => {
  it('μια ομαδική εγγραφή μπαίνει σε ΟΛΑ τα buckets των μελών της', () => {
    const entries = [{ id: 1, studentIds: [10, 20] }, { id: 2, studentIds: [10] }]
    const grouped = groupEntriesByStudentId(entries)
    expect(grouped[10]).toHaveLength(2)
    expect(grouped[20]).toHaveLength(1)
  })
})

describe('groupSessionsByDate', () => {
  it('ομαδοποιεί sessions ανά ημερομηνία', () => {
    const sessions = [{ id: 1, date: '2026-07-01' }, { id: 2, date: '2026-07-01' }, { id: 3, date: '2026-07-02' }]
    const grouped = groupSessionsByDate(sessions)
    expect(grouped['2026-07-01']).toHaveLength(2)
    expect(grouped['2026-07-02']).toHaveLength(1)
  })
})

describe('unresolvedSessionReason', () => {
  it('null όταν δεν υπάρχει καμία παλαιότερη εγγραφή', () => {
    expect(unresolvedSessionReason([], {}, today)).toBeNull()
  })

  it('null όταν η παλαιότερη εγγραφή έχει αντίστοιχη session (ίδιο σύνολο studentIds, ίδια ημερομηνία)', () => {
    const entries = [{ date: '2026-07-20', studentIds: [1], status: 'pending' }]
    const sessionsByDate = { '2026-07-20': [{ studentIds: [1] }] }
    expect(unresolvedSessionReason(entries, sessionsByDate, today)).toBeNull()
  })

  it('null όταν η εγγραφή είναι ρητά skipped (απόφαση εκπαιδευτικού, όχι εκκρεμότητα)', () => {
    const entries = [{ date: '2026-07-20', studentIds: [1], status: 'skipped' }]
    expect(unresolvedSessionReason(entries, {}, today)).toBeNull()
  })

  it('null όταν η εγγραφή είναι εκτός lookback window (πολύ παλιά)', () => {
    const tooOld = addDays(today, -(UNRESOLVED_ENTRY_LOOKBACK_DAYS + 1))
    const entries = [{ date: tooOld, studentIds: [1], status: 'pending' }]
    expect(unresolvedSessionReason(entries, {}, today)).toBeNull()
  })

  it('ΜΙΑ εγγραφή χωρίς αντίστοιχη session μέσα στο lookback → reason με singular label', () => {
    const recentDate = addDays(today, -3)
    const entries = [{ date: recentDate, studentIds: [1], status: 'pending' }]
    const reason = unresolvedSessionReason(entries, {}, today)
    expect(reason.type).toBe('unresolvedSession')
    expect(reason.count).toBe(1)
    expect(reason.label).toContain('Εκκρεμεί')
  })

  it('πολλές unresolved εγγραφές → ΜΙΑ συνοπτική ένδειξη με πλήθος, όχι μία ανά εγγραφή', () => {
    const entries = [
      { date: addDays(today, -2), studentIds: [1], status: 'pending' },
      { date: addDays(today, -5), studentIds: [1], status: 'pending' }
    ]
    const reason = unresolvedSessionReason(entries, {}, today)
    expect(reason.count).toBe(2)
    expect(reason.label).toBe('2 εκκρεμείς προηγούμενες συνεδρίες')
  })
})

describe('draftReportReason', () => {
  it('null όταν δεν υπάρχει draft report', () => {
    expect(draftReportReason([{ id: 1, status: 'final' }])).toBeNull()
  })

  it('reason όταν υπάρχει ένα draft report', () => {
    const reason = draftReportReason([{ id: 1, status: 'draft' }, { id: 2, status: 'final' }])
    expect(reason.type).toBe('draftReport')
    expect(reason.count).toBe(1)
    expect(reason.label).toBe('Πρόχειρη αναφορά')
  })

  it('deduplicate ανά report id — το ίδιο id δεν μετράει δύο φορές', () => {
    const reason = draftReportReason([{ id: 1, status: 'draft' }, { id: 1, status: 'draft' }])
    expect(reason.count).toBe(1)
  })

  it('πολλαπλά draft reports → πλήθος στο label', () => {
    const reason = draftReportReason([{ id: 1, status: 'draft' }, { id: 2, status: 'draft' }])
    expect(reason.count).toBe(2)
    expect(reason.label).toBe('2 πρόχειρες αναφορές')
  })
})

describe('computeQueueRowAttention', () => {
  it('null-like (κενό array) όταν τίποτα δεν ισχύει', () => {
    const result = computeQueueRowAttention([1], {
      goalAttentionByStudentId: {},
      pastEntriesByStudentId: {},
      sessionsByDate: {},
      reportsByStudentId: {},
      today
    })
    expect(result).toEqual([])
  })

  it('συνδυάζει unresolved session + goal attention + draft report για ΤΟΝ ΙΔΙΟ μαθητή, σωστή σειρά προτεραιότητας', () => {
    const result = computeQueueRowAttention([1], {
      goalAttentionByStudentId: { 1: [{ goalId: 100, reasons: [{ type: 'stale', label: 'Χωρίς μέτρηση 20 ημέρες', days: 20 }] }] },
      pastEntriesByStudentId: { 1: [{ date: addDays(today, -3), studentIds: [1], status: 'pending' }] },
      sessionsByDate: {},
      reportsByStudentId: { 1: [{ id: 5, status: 'draft' }] },
      today
    })
    expect(result.map((r) => r.type)).toEqual(['unresolvedSession', 'stale', 'draftReport'])
    expect(result.every((r) => r.studentId === 1)).toBe(true)
  })

  it('ομαδική γραμμή — aggregation ΑΝΑ μαθητή, κάθε reason κρατάει το δικό του studentId', () => {
    const result = computeQueueRowAttention([1, 2], {
      goalAttentionByStudentId: {
        1: [{ goalId: 100, reasons: [{ type: 'stale', label: 'Χωρίς μέτρηση 20 ημέρες', days: 20 }] }],
        2: [{ goalId: 200, reasons: [{ type: 'pausedTooLong', label: 'Σε παύση 50 ημέρες', days: 50 }] }]
      },
      pastEntriesByStudentId: {},
      sessionsByDate: {},
      reportsByStudentId: {},
      today
    })
    expect(result).toHaveLength(2)
    expect(result.find((r) => r.type === 'stale').studentId).toBe(1)
    expect(result.find((r) => r.type === 'pausedTooLong').studentId).toBe(2)
  })

  it('αποφεύγει διπλότυπες ενδείξεις ίδιου μαθητή/ίδιου τύπου — κρατάει τη χειρότερη (μεγαλύτερο days)', () => {
    const result = computeQueueRowAttention([1], {
      goalAttentionByStudentId: {
        1: [
          { goalId: 100, reasons: [{ type: 'stale', label: 'Χωρίς μέτρηση 15 ημέρες', days: 15 }] },
          { goalId: 101, reasons: [{ type: 'stale', label: 'Χωρίς μέτρηση 30 ημέρες', days: 30 }] }
        ]
      },
      pastEntriesByStudentId: {},
      sessionsByDate: {},
      reportsByStudentId: {},
      today
    })
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Χωρίς μέτρηση 30 ημέρες')
  })
})

describe('mergeQueueRowAttention', () => {
  it('προσθέτει το attentionSignal.js αποτέλεσμα στη σωστή θέση προτεραιότητας (mood πριν από stale)', () => {
    const reasons = [{ studentId: 1, type: 'stale', label: 'Χωρίς μέτρηση 20 ημέρες', days: 20 }]
    const signal = { studentId: 1, type: 'mood', label: '2 συνεχόμενες συνεδρίες με δύσκολη διάθεση' }
    const merged = mergeQueueRowAttention(reasons, signal)
    expect(merged.map((r) => r.type)).toEqual(['mood', 'stale'])
  })

  it('milestone (θετικό/ενημερωτικό) μπαίνει ΤΕΛΕΥΤΑΙΟ, μετά ακόμα και το nearCriterion', () => {
    const reasons = [{ studentId: 1, type: 'nearCriterion', label: 'Κοντά στο κριτήριο' }]
    const signal = { studentId: 1, type: 'milestone', label: 'Σημαντική παρατήρηση' }
    const merged = mergeQueueRowAttention(reasons, signal)
    expect(merged.map((r) => r.type)).toEqual(['nearCriterion', 'milestone'])
  })

  it('χωρίς signal (π.χ. ομαδική γραμμή) επιστρέφει μόνο τα reasons, ταξινομημένα', () => {
    const reasons = [
      { studentId: 1, type: 'nearCriterion', label: 'Κοντά στο κριτήριο' },
      { studentId: 1, type: 'stale', label: 'Χωρίς μέτρηση 20 ημέρες', days: 20 }
    ]
    const merged = mergeQueueRowAttention(reasons, null)
    expect(merged.map((r) => r.type)).toEqual(['stale', 'nearCriterion'])
  })
})
