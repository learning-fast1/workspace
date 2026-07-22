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

// Stage 10 (Regression Gate) — bug fix: το reportText.js χρησιμοποιούσε το παλιό, 4-τύπων
// formatMeasurementValue/measurementNumericValue/parseCriterionTarget — checklist/ratingScale/
// frequency/narrative έδειχναν ουσιαστικά τίποτα. Τώρα ΑΠΟΚΛΕΙΣΤΙΚΑ registry
// (formatRecordedValue/computeProgressPercent/meetsCriterion) — καμία hardcoded λίστα τύπων στο
// ίδιο το reportText.js. Καλύπτει και τους 8 τύπους, ρητά διακρίνοντας supportsProgress true/false.
describe('generateReportText — και οι 8 τύποι μέτρησης, αποκλειστικά μέσω registry', () => {
  const sessions = [
    { id: 1, date: '2026-01-05', studentIds: [1], durationMinutes: 20, absentStudentIds: [] },
    { id: 2, date: '2026-02-05', studentIds: [1], durationMinutes: 20, absentStudentIds: [] }
  ]

  it('checklist (supportsProgress: true) — αναγνωρίζει βελτίωση, Τρέχον επίπεδο σωστό (ΟΧΙ «—»)', () => {
    const goal = {
      id: 1, domain: 'reading', title: 'Βήματα πλυσίματος χεριών', baseline: '',
      measurementType: 'checklist',
      criterionConfig: { items: [{ id: 'a', label: 'Βρέχει χέρια' }, { id: 'b', label: 'Σαπούνι' }, { id: 'c', label: 'Ξέβγαλμα' }, { id: 'd', label: 'Στέγνωμα' }], targetCompletedCount: 4 },
      criterion: '4 από 4 στοιχεία', status: 'active', startDate: '2025-09-01'
    }
    const measurements = [
      { id: 1, sessionId: 1, goalId: 1, value: { completedItemIds: ['a'] } },
      { id: 2, sessionId: 2, goalId: 1, value: { completedItemIds: ['a', 'b', 'c', 'd'] } }
    ]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).not.toContain('Τρέχον επίπεδο: —')
    expect(text).toMatch(/Πορεία: Βελτίωση από .* σε .*\./)
    expect(text).toContain('Κριτήριο: 4 από 4 στοιχεία — Επιτεύχθηκε.')
  })

  it('taskAnalysis (supportsProgress: true) — αναγνωρίζει πτώση', () => {
    const goal = {
      id: 1, domain: 'self-care', title: 'Βήματα ντυσίματος', baseline: '',
      measurementType: 'taskAnalysis',
      criterionConfig: { steps: [{ id: 'a', label: 'Παντελόνι', order: 1 }, { id: 'b', label: 'Μπλούζα', order: 2 }, { id: 'c', label: 'Παπούτσια', order: 3 }], targetCompletedCount: 3 },
      criterion: '3 από 3 βήματα', status: 'active', startDate: '2025-09-01'
    }
    const measurements = [
      { id: 1, sessionId: 1, goalId: 1, value: { completedStepIds: ['a', 'b', 'c'] } },
      { id: 2, sessionId: 2, goalId: 1, value: { completedStepIds: ['a'] } }
    ]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).toMatch(/Πορεία: Πτώση από .* σε .*\./)
  })

  it('duration (supportsProgress: false) — ΧΩΡΙΣ επινοημένη Βελτίωση/Πτώση, τίμια χρονολογική καταγραφή· achievement ΔΟΥΛΕΥΕΙ ανεξάρτητα', () => {
    const goal = {
      id: 1, domain: 'attention', title: 'Παραμονή σε εργασία', baseline: '',
      measurementType: 'duration',
      criterionConfig: { direction: 'increase', targetMinutes: 10, context: '' },
      criterion: 'Αύξηση σε τουλάχιστον 10′', status: 'active', startDate: '2025-09-01'
    }
    const measurements = [
      { id: 1, sessionId: 1, goalId: 1, value: { minutes: 4 } },
      { id: 2, sessionId: 2, goalId: 1, value: { minutes: 12 } }
    ]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).not.toMatch(/Βελτίωση|Πτώση|Σταθερό επίπεδο/)
    expect(text).toContain('Πορεία: 2 καταγραφές στην περίοδο — από «4 λεπτά» έως «12 λεπτά».')
    // Το meetsCriterion ΔΕΝ εξαρτάται από το supportsProgress — η επίτευξη υπολογίζεται κανονικά.
    expect(text).toContain('Κριτήριο: Αύξηση σε τουλάχιστον 10′ — Επιτεύχθηκε.')
  })

  it('promptLevel (supportsProgress: false) — Τρέχον επίπεδο σωστό, καμία επινοημένη πορεία', () => {
    const goal = {
      id: 1, domain: 'oral-language', title: 'Ζητά βοήθεια', baseline: '',
      measurementType: 'promptLevel', criterionConfig: { targetLevel: 'independent' },
      criterion: 'Ανεξάρτητα', status: 'active', startDate: '2025-09-01'
    }
    const measurements = [{ id: 1, sessionId: 1, goalId: 1, value: { level: 'verbal' } }]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).toContain('Τρέχον επίπεδο: Λεκτική υπόδειξη')
    expect(text).toContain('Πορεία: Μία μέτρηση καταγράφηκε στην περίοδο.')
  })

  it('frequency (supportsProgress: false) — Τρέχον επίπεδο σωστό, achievement δουλεύει', () => {
    const goal = {
      id: 1, domain: 'behavior', title: 'Διακοπή δραστηριότητας', baseline: '',
      measurementType: 'frequency', criterionConfig: { direction: 'decrease', targetCount: 0, context: '' },
      criterion: 'Μείωση σε το πολύ 0 φορές', status: 'active', startDate: '2025-09-01'
    }
    const measurements = [{ id: 1, sessionId: 1, goalId: 1, value: { count: 0 } }]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).toContain('Τρέχον επίπεδο: 0 φορές')
    expect(text).toContain('Κριτήριο: Μείωση σε το πολύ 0 φορές — Επιτεύχθηκε.')
  })

  it('ratingScale (supportsProgress: false) — Τρέχον επίπεδο σωστό, achievement δουλεύει', () => {
    const goal = {
      id: 1, domain: 'social-skills', title: 'Συμμετοχή σε ομαδικό παιχνίδι', baseline: '',
      measurementType: 'ratingScale',
      criterionConfig: { targetLevel: 4, levelDescriptions: { 1: 'Καθόλου', 2: 'Λίγο', 3: 'Μέτρια', 4: 'Αρκετά', 5: 'Πλήρως' } },
      criterion: '4 — Αρκετά', status: 'active', startDate: '2025-09-01'
    }
    const measurements = [{ id: 1, sessionId: 1, goalId: 1, value: { level: 4 } }]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).toContain('Κριτήριο: 4 — Αρκετά — Επιτεύχθηκε.')
  })

  it('narrative (supportsProgress: false, meetsCriterion πάντα notComputable) — καμία κρίση επίτευξης, μόνο το κριτήριο ως έχει', () => {
    const goal = {
      id: 1, domain: 'emotional-development', title: 'Διαχείριση θυμού', baseline: '',
      measurementType: 'narrative', criterionConfig: { successDescription: 'Ζητά βοήθεια αντί να φωνάζει' },
      criterion: 'Ζητά βοήθεια αντί να φωνάζει', status: 'active', startDate: '2025-09-01'
    }
    const measurements = [{ id: 1, sessionId: 1, goalId: 1, value: { note: 'Καλή πρόοδος σήμερα' } }]
    const text = generateReportText(baseArgs({ goals: [goal], sessions, measurements }))
    expect(text).toContain('Τρέχον επίπεδο: Καλή πρόοδος σήμερα')
    expect(text).toContain('Κριτήριο: Ζητά βοήθεια αντί να φωνάζει')
    expect(text).not.toContain('Ζητά βοήθεια αντί να φωνάζει — Επιτεύχθηκε')
    expect(text).not.toContain('Ζητά βοήθεια αντί να φωνάζει — Δεν έχει επιτευχθεί')
  })
})

describe('generateReportText — ταξινόμηση τομέων/στόχων', () => {
  it('εμφανίζει τους τομείς με τη σταθερή σειρά του domains.js, όχι με τη σειρά δημιουργίας των στόχων', () => {
    const goals = [
      { id: 1, domain: 'behavior', title: 'Στόχος συμπεριφοράς', status: 'active', startDate: '2026-01-01', priority: 'medium' },
      { id: 2, domain: 'mobility', title: 'Στόχος κινητικότητας', status: 'active', startDate: '2026-01-01', priority: 'medium' },
      { id: 3, domain: 'communication', title: 'Στόχος επικοινωνίας', status: 'active', startDate: '2026-01-01', priority: 'medium' }
    ]
    const text = generateReportText(baseArgs({ goals }))
    const mobilityIndex = text.indexOf('## Κινητική')
    const communicationIndex = text.indexOf('## Επικοινωνία')
    const behaviorIndex = text.indexOf('## Συμπεριφορά')
    expect(mobilityIndex).toBeGreaterThan(-1)
    expect(mobilityIndex).toBeLessThan(communicationIndex)
    expect(communicationIndex).toBeLessThan(behaviorIndex)
  })

  it('εμφανίζει πρώτα τους στόχους υψηλής προτεραιότητας μέσα σε έναν τομέα', () => {
    const goals = [
      { id: 1, domain: 'communication', title: 'Χαμηλής προτεραιότητας', status: 'active', startDate: '2026-01-01', priority: 'low' },
      { id: 2, domain: 'communication', title: 'Υψηλής προτεραιότητας', status: 'active', startDate: '2026-01-01', priority: 'high' }
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
