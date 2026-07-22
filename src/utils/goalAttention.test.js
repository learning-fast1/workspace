import { describe, expect, it } from 'vitest'
import {
  computeGoalAttention, computeAttentionForStudent, computeAttentionAcrossStudents,
  GOAL_STALE_DAYS, GOAL_PAUSED_TOO_LONG_DAYS
} from './goalAttention.js'

const TODAY = new Date('2026-07-15T12:00:00.000Z')

function activeGoal(overrides = {}) {
  return { id: 1, status: 'active', domain: 'reading', title: 'Τ', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-06-01', ...overrides }
}

function pausedGoal(overrides = {}) {
  return { id: 1, status: 'paused', domain: 'reading', title: 'Τ', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01', ...overrides }
}

function measurement(daysAgo, value, goalId = 1) {
  const d = new Date(TODAY.getTime() - daysAgo * 86400000)
  return { goalId, date: d.toISOString().slice(0, 10), value }
}

function pausedEvent(daysAgo, goalId = 1) {
  const d = new Date(TODAY.getTime() - daysAgo * 86400000)
  return { goalId, at: d.toISOString(), type: 'statusChanged', fromStatus: 'active', toStatus: 'paused' }
}

describe('exported thresholds — product defaults (Technical Plan Στάδιο 8, σημείο 2)', () => {
  it('έχουν τις ρητά ζητηθείσες τιμές', () => {
    expect(GOAL_STALE_DAYS).toBe(14)
    expect(GOAL_PAUSED_TOO_LONG_DAYS).toBe(42)
    // GOAL_NEAR_CRITERION_RATIO αφαιρέθηκε από εδώ στο Στάδιο 2 (Goal Wizard Step 3 redesign) — το
    // ισοδύναμο για successRatio ζει πλέον ως NEAR_CRITERION_RATIO στο measurementTypes/successRatio.js,
    // τεσταρισμένο εκεί. Κάθε άλλος τύπος έχει τον δικό του, διαφορετικού είδους κανόνα.
  })
})

describe('stale — boundary στις 13/14/15 ημέρες (σημείο 3, 9)', () => {
  it('13 ημέρες από την τελευταία μέτρηση → ΟΧΙ stale', () => {
    const result = computeGoalAttention(activeGoal(), [measurement(13, { successes: 5, attempts: 10 })], [], TODAY)
    expect(result).toBe(null)
  })

  it('ΑΚΡΙΒΩΣ 14 ημέρες → ΟΧΙ ακόμα stale (όριο: αυστηρά μεγαλύτερο από 14, όχι >=)', () => {
    const result = computeGoalAttention(activeGoal(), [measurement(14, { successes: 5, attempts: 10 })], [], TODAY)
    expect(result).toBe(null)
  })

  it('15 ημέρες → stale', () => {
    const result = computeGoalAttention(activeGoal(), [measurement(15, { successes: 5, attempts: 10 })], [], TODAY)
    expect(result).not.toBe(null)
    expect(result.reasons).toEqual([{ type: 'stale', since: expect.any(String), days: 15, label: 'Χωρίς μέτρηση 15 ημέρες' }])
  })

  it('goal χωρίς ΚΑΜΙΑ μέτρηση → reference date = startDate', () => {
    const goal = activeGoal({ startDate: '2026-06-01' }) // 44 μέρες πριν το TODAY
    const result = computeGoalAttention(goal, [], [], TODAY)
    expect(result.reasons[0]).toMatchObject({ type: 'stale', since: '2026-06-01' })
  })

  it('ΝΕΟΣ στόχος (startDate σήμερα) ΧΩΡΙΣ μέτρηση ακόμα → ΔΕΝ είναι stale', () => {
    const goal = activeGoal({ startDate: '2026-07-15' })
    const result = computeGoalAttention(goal, [], [], TODAY)
    expect(result).toBe(null)
  })

  it('ΝΕΟΣ στόχος (startDate πριν 5 μέρες) → ΔΕΝ είναι ακόμα stale', () => {
    const goal = activeGoal({ startDate: '2026-07-10' })
    const result = computeGoalAttention(goal, [], [], TODAY)
    expect(result).toBe(null)
  })
})

// Αναθεωρήθηκε στο Technical Plan Στάδιο 2 (Goal Wizard Step 3 redesign) — «κοντά στο κριτήριο»
// συγκρίνεται πλέον με το ΠΡΑΓΜΑΤΙΚΟ criterion του στόχου (target×90%), ΟΧΙ με ένα flat 90% απόλυτο
// κατώφλι που αγνοούσε το criterion. Default activeGoal() έχει criterion='8/10' → target=80%,
// άρα near-κατώφλι = 72%. ΣΚΟΠΙΜΗ διόρθωση συμπεριφοράς, όχι μόνο αφαίρεση του promptLevel
// ψευδο-progress — βλ. αναφορά Σταδίου 2 για το πλήρες before/after.
describe('nearCriterion — target-relative κατώφλι (72%/75%/80%, target 80%) (σημείο 4, 9)', () => {
  it('70% (κάτω από το κατώφλι 72%) → ΔΕΝ πιάνει', () => {
    const result = computeGoalAttention(activeGoal(), [measurement(1, { successes: 70, attempts: 100 })], [], TODAY)
    expect(result).toBe(null)
  })

  it('ΑΚΡΙΒΩΣ 72% (=80×0.9) → πιάνει το κατώφλι (όριο: >=0.9 του στόχου)', () => {
    const result = computeGoalAttention(activeGoal(), [measurement(1, { successes: 72, attempts: 100 })], [], TODAY)
    expect(result.reasons).toContainEqual({ type: 'nearCriterion', label: '72% επιτυχία' })
  })

  it('75% (το παράδειγμα του χρήστη: κοντά στο 80%, ΟΧΙ flat 90%) → nearCriterion', () => {
    const result = computeGoalAttention(activeGoal(), [measurement(1, { successes: 75, attempts: 100 })], [], TODAY)
    expect(result.reasons).toContainEqual({ type: 'nearCriterion', label: '75% επιτυχία' })
  })

  it('80%+ → ΗΔΗ πέτυχε τον στόχο, άρα meets ΟΧΙ near — καμία nearCriterion αναφορά', () => {
    expect(computeGoalAttention(activeGoal(), [measurement(1, { successes: 80, attempts: 100 })], [], TODAY)).toBe(null)
    expect(computeGoalAttention(activeGoal(), [measurement(1, { successes: 100, attempts: 100 })], [], TODAY)).toBe(null)
  })

  it('89%: υπερβαίνει ήδη τον στόχο 80% → meets, ΟΧΙ near (πριν το Στάδιο 2 αυτό ήταν "κάτω από flat 90%")', () => {
    const result = computeGoalAttention(activeGoal(), [measurement(1, { successes: 89, attempts: 100 })], [], TODAY)
    expect(result).toBe(null)
  })

  it('μη αριθμητικό/άγνωστο criterion (taskAnalysis) → δεν παράγεται reason, ΔΕΝ μαντεύεται', () => {
    const goal = activeGoal({ measurementType: 'taskAnalysis', criterion: 'κάτι ασαφές' })
    const result = computeGoalAttention(goal, [measurement(1, { stepsCompleted: 9 })], [], TODAY)
    expect(result).toBe(null)
  })

  it('απουσία measurements → κανένα reason (ούτε stale εδώ αφού το goal μόλις ξεκίνησε, ούτε nearCriterion)', () => {
    const goal = activeGoal({ startDate: '2026-07-15' })
    expect(computeGoalAttention(goal, [], [], TODAY)).toBe(null)
  })

  it('διαφορετικοί measurement types — duration ΠΟΤΕ παράγει nearCriterion όταν είναι legacy (χωρίς δηλωμένη κατεύθυνση)', () => {
    const goal = activeGoal({ measurementType: 'duration', criterion: '20 λεπτά' })
    const result = computeGoalAttention(goal, [measurement(1, { minutes: 20 })], [], TODAY)
    expect(result).toBe(null)
  })

  it('διαφορετικοί measurement types — taskAnalysis (λείπει ακριβώς 1 βήμα, ίδιο κριτήριο structured/legacy) φτάνει το κατώφλι', () => {
    const goal = activeGoal({ measurementType: 'taskAnalysis', criterion: '10 βήματα' })
    const result = computeGoalAttention(goal, [measurement(1, { stepsCompleted: 9 })], [], TODAY)
    expect(result.reasons).toContainEqual({ type: 'nearCriterion', label: 'Απομένει 1 βήμα για επίτευξη' })
  })

  it('διαφορετικοί measurement types — promptLevel μία βαθμίδα πριν τον στόχο (verbal έναντι στόχου independent)', () => {
    const goal = activeGoal({ measurementType: 'promptLevel', criterion: 'Ανεξάρτητα' })
    const result = computeGoalAttention(goal, [measurement(1, { level: 'verbal' })], [], TODAY)
    expect(result.reasons).toContainEqual({ type: 'nearCriterion', label: 'Απομένει 1 βαθμίδα υποστήριξης για επίτευξη' })
  })

  it('promptLevel ΗΔΗ στον στόχο (independent) → ΚΑΜΙΑ nearCriterion (πριν: bug, έδειχνε πάντα "near" μέσω ψευδο-ποσοστού 100%)', () => {
    const goal = activeGoal({ measurementType: 'promptLevel', criterion: 'Ανεξάρτητα' })
    const result = computeGoalAttention(goal, [measurement(1, { level: 'independent' })], [], TODAY)
    expect(result).toBe(null)
  })
})

describe('pausedTooLong — αξιόπιστο pausedSince ΜΟΝΟ από goalEvents (σημείο 5, 9)', () => {
  it('goal paused, ΥΠΑΡΧΕΙ goalEvent μετάβασης πριν 43 μέρες → pausedTooLong', () => {
    const result = computeGoalAttention(pausedGoal(), [], [pausedEvent(43)], TODAY)
    expect(result.reasons).toEqual([{ type: 'pausedTooLong', since: expect.any(String), days: 43, label: 'Σε παύση 43 ημέρες' }])
  })

  it('ΑΚΡΙΒΩΣ 42 ημέρες → ΟΧΙ ακόμα (όριο: αυστηρά μεγαλύτερο από 42)', () => {
    const result = computeGoalAttention(pausedGoal(), [], [pausedEvent(42)], TODAY)
    expect(result).toBe(null)
  })

  it('goal paused, ΚΑΝΕΝΑ goalEvent μετάβασης σε paused → ΔΕΝ μαντεύεται, reason δεν παράγεται', () => {
    const result = computeGoalAttention(pausedGoal(), [], [], TODAY)
    expect(result).toBe(null)
  })

  it('goal paused, goalEvents υπάρχουν αλλά ΚΑΝΕΝΑ δεν είναι μετάβαση σε paused → δεν μαντεύεται', () => {
    const unrelatedEvent = { goalId: 1, at: '2026-01-01T00:00:00.000Z', type: 'created', toStatus: 'active' }
    const result = computeGoalAttention(pausedGoal(), [], [unrelatedEvent], TODAY)
    expect(result).toBe(null)
  })

  it('πολλαπλές μεταβάσεις σε paused (πολλαπλοί κύκλοι) → χρησιμοποιεί την ΠΙΟ ΠΡΟΣΦΑΤΗ, όχι την πρώτη', () => {
    const oldPause = pausedEvent(100) // πολύ παλιά — αν χρησιμοποιούνταν αυτή θα έδειχνε πολύ μεγαλύτερο πλήθος ημερών
    const recentPause = pausedEvent(43)
    const result = computeGoalAttention(pausedGoal(), [], [oldPause, recentPause], TODAY)
    expect(result.reasons[0].days).toBe(43) // η πρόσφατη, όχι η παλιά (100)
  })
})

describe('status-gating — καμία διασταύρωση κατηγοριών (σημείο 9)', () => {
  it('active goal ΠΟΤΕ δεν παράγει pausedTooLong, ακόμα κι αν υπάρχει παλιό goalEvent παύσης', () => {
    // startDate φρέσκο ώστε το goal να ΜΗΝ είναι stale για άλλο λόγο — αλλιώς η δοκιμή δεν θα
    // αποδείκνυε τίποτα για το pausedTooLong συγκεκριμένα.
    const result = computeGoalAttention(activeGoal({ startDate: '2026-07-15' }), [], [pausedEvent(100)], TODAY)
    expect(result).toBe(null)
  })

  it('paused goal ΠΟΤΕ δεν παράγει stale, ακόμα κι αν δεν έχει μετρηθεί ποτέ', () => {
    const goal = pausedGoal({ startDate: '2026-01-01' }) // πολύ παλιό startDate, θα ήταν stale αν ήταν active
    const result = computeGoalAttention(goal, [], [pausedEvent(1)], TODAY) // πρόσφατη παύση, όχι too long
    expect(result).toBe(null)
  })

  it('paused goal ΠΟΤΕ δεν παράγει nearCriterion, ακόμα κι αν η τελευταία μέτρηση ήταν 100%', () => {
    const result = computeGoalAttention(pausedGoal(), [measurement(1, { successes: 100, attempts: 100 })], [pausedEvent(1)], TODAY)
    expect(result).toBe(null)
  })

  it('achieved/archived goals δεν παράγουν κανένα reason', () => {
    expect(computeGoalAttention(activeGoal({ status: 'achieved' }), [measurement(100, { successes: 1, attempts: 100 })], [], TODAY)).toBe(null)
    expect(computeGoalAttention(activeGoal({ status: 'archived' }), [measurement(100, { successes: 1, attempts: 100 })], [], TODAY)).toBe(null)
  })
})

describe('συνδυασμός πολλαπλών reasons στο ίδιο goal', () => {
  it('active goal με πρόσφατη μέτρηση 75% (κοντά στο criterion 80%) αλλά ΠΑΛΙΑ (20 μέρες) → ΚΑΙ nearCriterion ΚΑΙ stale', () => {
    const result = computeGoalAttention(activeGoal(), [measurement(20, { successes: 75, attempts: 100 })], [], TODAY)
    expect(result.reasons).toHaveLength(2)
    expect(result.reasons.map((r) => r.type).sort()).toEqual(['nearCriterion', 'stale'])
  })
})

describe('καθαρότητα (pure) — καμία μεταβολή εισόδων, κανένα new Date() εσωτερικά (σημείο 7)', () => {
  it('ΔΕΝ μεταλλάσσει το goal object', () => {
    const goal = activeGoal()
    const snapshot = JSON.stringify(goal)
    computeGoalAttention(goal, [measurement(1, { successes: 9, attempts: 10 })], [], TODAY)
    expect(JSON.stringify(goal)).toBe(snapshot)
  })

  it('ΔΕΝ μεταλλάσσει το measurements array (ούτε in-place sort)', () => {
    const measurements = [measurement(5, { successes: 1, attempts: 2 }), measurement(1, { successes: 9, attempts: 10 }), measurement(10, { successes: 2, attempts: 4 })]
    const snapshot = JSON.stringify(measurements)
    computeGoalAttention(activeGoal(), measurements, [], TODAY)
    expect(JSON.stringify(measurements)).toBe(snapshot)
  })

  it('ΔΕΝ μεταλλάσσει το goalEvents array', () => {
    const events = [pausedEvent(50), pausedEvent(10)]
    const snapshot = JSON.stringify(events)
    computeGoalAttention(pausedGoal(), [], events, TODAY)
    expect(JSON.stringify(events)).toBe(snapshot)
  })

  it('ίδιο αποτέλεσμα για ίδια inputs/today, κλήση μετά από κλήση (deterministic, όχι Date.now())', () => {
    const goal = activeGoal()
    const measurements = [measurement(15, { successes: 9, attempts: 10 })]
    const r1 = computeGoalAttention(goal, measurements, [], TODAY)
    const r2 = computeGoalAttention(goal, measurements, [], TODAY)
    expect(r1).toEqual(r2)
  })
})

describe('computeAttentionForStudent — ομαδοποίηση, deterministic σειρά', () => {
  it('παράγει ΕΝΑ αποτέλεσμα ανά goal, ταξινομημένο stale → pausedTooLong → nearCriterion', () => {
    const goals = [
      { id: 1, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' }, // θα γίνει stale
      { id: 2, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' }, // θα γίνει nearCriterion
      { id: 3, status: 'paused', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' } // θα γίνει pausedTooLong
    ]
    const measurements = [
      measurement(20, { successes: 5, attempts: 10 }, 1), // stale μόνο (50%, όχι κοντά)
      measurement(1, { successes: 75, attempts: 100 }, 2) // πρόσφατο, nearCriterion (κοντά στο criterion 80%)
    ]
    const goalEvents = [pausedEvent(50, 3)]

    const results = computeAttentionForStudent(goals, measurements, goalEvents, TODAY)
    expect(results.map((r) => r.goalId)).toEqual([1, 3, 2]) // stale(1) → pausedTooLong(3) → nearCriterion(2)
  })

  it('deterministic tie-break κατά goalId όταν ο ίδιος τύπος λόγου', () => {
    const goals = [
      { id: 5, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' },
      { id: 2, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' }
    ]
    const measurements = [measurement(20, { successes: 5, attempts: 10 }, 5), measurement(20, { successes: 5, attempts: 10 }, 2)]
    const results = computeAttentionForStudent(goals, measurements, [], TODAY)
    expect(results.map((r) => r.goalId)).toEqual([2, 5]) // αύξουσα goalId, όχι σειρά εισαγωγής
  })

  it('goals χωρίς κανένα reason δεν εμφανίζονται καθόλου στο αποτέλεσμα', () => {
    const goals = [{ id: 1, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-07-15' }]
    expect(computeAttentionForStudent(goals, [], [], TODAY)).toEqual([])
  })
})

describe('computeAttentionAcrossStudents — cross-student, καμία διπλή εγγραφή, deterministic σειρά', () => {
  it('ΕΝΑ αποτέλεσμα ανά goal ακόμα κι όταν έχει πολλαπλούς λόγους (όχι διπλότυπο ανά reason)', () => {
    const entries = [
      {
        studentId: 1,
        goals: [{ id: 1, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' }],
        measurements: [measurement(20, { successes: 75, attempts: 100 }, 1)], // ΚΑΙ nearCriterion ΚΑΙ stale
        goalEvents: []
      }
    ]
    const results = computeAttentionAcrossStudents(entries, TODAY)
    expect(results).toHaveLength(1) // ΟΧΙ 2 (μία εγγραφή ανά reason θα ήταν λάθος)
    expect(results[0].reasons).toHaveLength(2)
  })

  it('συνδυάζει πολλούς μαθητές με deterministic σειρά (rank, μετά studentId, μετά goalId)', () => {
    const entries = [
      {
        studentId: 2,
        goals: [{ id: 10, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' }],
        measurements: [measurement(20, { successes: 5, attempts: 10 }, 10)], // stale
        goalEvents: []
      },
      {
        studentId: 1,
        goals: [{ id: 20, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' }],
        measurements: [measurement(1, { successes: 75, attempts: 100 }, 20)], // nearCriterion (κοντά στο criterion 80%)
        goalEvents: []
      }
    ]
    const results = computeAttentionAcrossStudents(entries, TODAY)
    // stale (studentId 2, goal 10) πρώτο λόγω rank, ΟΧΙ επειδή είναι πρώτο στο entries array.
    expect(results.map((r) => ({ studentId: r.studentId, goalId: r.goalId, type: r.reasons[0].type }))).toEqual([
      { studentId: 2, goalId: 10, type: 'stale' },
      { studentId: 1, goalId: 20, type: 'nearCriterion' }
    ])
  })

  it('κάθε entry περιλαμβάνει studentId', () => {
    const entries = [{
      studentId: 7,
      goals: [{ id: 1, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' }],
      measurements: [measurement(20, { successes: 5, attempts: 10 }, 1)],
      goalEvents: []
    }]
    expect(computeAttentionAcrossStudents(entries, TODAY)[0].studentId).toBe(7)
  })

  it('ΔΕΝ μεταλλάσσει τα entries ή τα εσωτερικά arrays τους', () => {
    const entries = [{
      studentId: 1,
      goals: [{ id: 1, status: 'active', criterion: '8/10', measurementType: 'successRatio', startDate: '2026-01-01' }],
      measurements: [measurement(20, { successes: 5, attempts: 10 }, 1)],
      goalEvents: []
    }]
    const snapshot = JSON.stringify(entries)
    computeAttentionAcrossStudents(entries, TODAY)
    expect(JSON.stringify(entries)).toBe(snapshot)
  })
})
