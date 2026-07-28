import { measurementNumericValue } from './measurementValue.js'
import { computeGoalAttention } from './goalAttention.js'
import { meetsCriterion as registryMeetsCriterion } from './measurementTypes/index.js'

// Pure λογική για το Student Dashboard (Technical Plan Στάδιο 12) — καμία Dexie query εδώ μέσα,
// καμία new Date() εσωτερικά (το `today` περνάει πάντα ως παράμετρος, ίδια αρχή με goalAttention.js).
// Ο καλών (StudentDashboardPanel.jsx) είναι υπεύθυνος να έχει ήδη φορτώσει goals/measurements/
// goalEvents ΜΑΖΙΚΑ (batched queries, καμία N+1 — βλ. σχόλιο στο loadStudentDashboardData εκεί).

// ---------------------------------------------------------------------------------------------
// Completion candidate (σημείο 4) — ΞΕΧΩΡΙΣΤΗ λογική από το nearCriterion του goalAttention.js.
// Αναθεωρήθηκε στο Technical Plan Στάδιο 2: το «meetsCriterion» ανά τύπο πλέον ζει ΑΠΟΚΛΕΙΣΤΙΚΑ
// στο utils/measurementTypes/ registry (ίδια πηγή που χρησιμοποιεί και το goalAttention.js) — αυτό
// το αρχείο κρατά ΜΟΝΟ τη γενική, type-agnostic έννοια «δύο συνεχόμενες μετρήσεις που καλύπτουν το
// criterion», χωρίς να ξέρει τίποτα για το πώς ο κάθε τύπος ορίζει «καλύπτει».
// ---------------------------------------------------------------------------------------------

// datedMeasurements: ήδη date-joined μετρήσεις ΕΝΟΣ στόχου (κάθε στοιχείο έχει `date`/`value`).
// «Δύο συνεχόμενες» = οι δύο πιο πρόσφατες βάσει date — ΟΙ ΑΜΕΣΩΣ διαδοχικές, όχι οποιεσδήποτε δύο.
// Αν το registry επιστρέψει computable:false για οποιαδήποτε από τις δύο (π.χ. legacy κείμενο που
// δεν parse-άρεται, ή τύπος όπως το narrative που ποτέ δεν υποστηρίζει meetsCriterion) → false,
// καμία μαντεψιά.
export function isCompletionCandidate(goal, datedMeasurements) {
  const sorted = datedMeasurements
    .filter((m) => m.date)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
  if (sorted.length < 2) return false

  const context = { criterionConfig: goal.criterionConfig, criterionText: goal.criterion }
  const latest = registryMeetsCriterion(goal.measurementType, sorted[0].value, context)
  const previous = registryMeetsCriterion(goal.measurementType, sorted[1].value, context)
  return latest.computable && latest.value === true && previous.computable && previous.value === true
}

// ---------------------------------------------------------------------------------------------
// «Τι άλλαξε από την προηγούμενη συνεδρία» (σημείο 7) — σύγκριση ανά goal, ΜΟΝΟ έγκυρες
// (αριθμητικά μετρήσιμες) μετρήσεις, ΜΟΝΟ όταν υπάρχουν 2 πραγματικά συγκρίσιμα σημεία. Ποτέ
// πλασματικό 0% όταν λείπουν δεδομένα — { available:false } αντί για ψεύτικη τιμή.
// ---------------------------------------------------------------------------------------------
export function computeGoalSessionDelta(goal, datedMeasurements) {
  const numericPoints = datedMeasurements
    .filter((m) => m.date)
    .map((m) => ({ date: m.date, numeric: measurementNumericValue(goal.measurementType, m.value) }))
    .filter((m) => m.numeric !== null)
    .sort((a, b) => b.date.localeCompare(a.date)) // πιο πρόσφατο πρώτο

  if (numericPoints.length < 2) {
    return { available: false, message: 'Δεν υπάρχουν ακόμη αρκετές μετρήσεις για σύγκριση.' }
  }

  const [latest, previous] = numericPoints
  const delta = latest.numeric - previous.numeric
  return {
    available: true,
    measurementType: goal.measurementType,
    latestDate: latest.date,
    previousDate: previous.date,
    latestValue: latest.numeric,
    previousValue: previous.numeric,
    delta,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'
  }
}

// ---------------------------------------------------------------------------------------------
// «Τι θα δουλέψω σήμερα» (σημείο 5) — ΜΟΝΟ active goals, ΠΟΤΕ paused/achieved/archived. Deterministic
// σειρά (κατά id) — ανεξάρτητη από τη σειρά επιστροφής της Dexie query στον καλούντα.
// ---------------------------------------------------------------------------------------------
export function computeTodaysPlanGoals(goals) {
  return goals.filter((g) => g.status === 'active').sort((a, b) => a.id - b.id)
}

// ---------------------------------------------------------------------------------------------
// «Γιατί είναι προτεραιότητα» (σημείο 6) — καταναλώνει το ΗΔΗ υπολογισμένο structured αποτέλεσμα
// του attention system (goalAttention.js, Στάδιο 8), ΚΑΜΙΑ επανάληψη του υπολογισμού stale/
// nearCriterion εδώ. Σειρά προτεραιότητας όταν ισχύουν πολλά ταυτόχρονα: προγραμματισμένος σήμερα
// (πιο συγκεκριμένο/δομικό) → stale → κοντά στο κριτήριο → υψηλή προτεραιότητα (πιο γενικό,
// στατικό πεδίο του goal) → γενικό fallback.
// ---------------------------------------------------------------------------------------------
export function computeGoalPriorityReason(goal, { hasSessionToday, attention }) {
  if (hasSessionToday) return 'Προγραμματισμένος για σήμερα'

  // label πλέον ΑΠΟΚΛΕΙΣΤΙΚΑ από το goalAttention.js (μοναδική πηγή αλήθειας, Sprint 7 feedback
  // χρήστη) — καμία δεύτερη διατύπωση εδώ.
  const staleReason = attention?.reasons.find((r) => r.type === 'stale')
  if (staleReason) return staleReason.label

  const nearReason = attention?.reasons.find((r) => r.type === 'nearCriterion')
  if (nearReason) return nearReason.label

  if (goal.priority === 'high') return 'Υψηλή προτεραιότητα'

  return 'Ενεργός στόχος'
}

// ---------------------------------------------------------------------------------------------
// «Επόμενη καλύτερη ενέργεια» (σημείο 3) — deterministic, σταματά στην ΠΡΩΤΗ συνθήκη που ταιριάζει,
// ΑΚΡΙΒΩΣ με αυτή τη σειρά προτεραιότητας. Το CTA label/type/προορισμός προέρχονται ΑΠΟΚΛΕΙΣΤΙΚΑ
// από εδώ — το component δεν ξαναγράφει καμία απόφαση.
//
//   1. σημερινή συνεδρία ΔΕΝ έχει ολοκληρωθεί           → 'startSession'
//   2. goal (active) με 2 συνεχόμενες μετρήσεις ≥ criterion → 'reviewCompletion'
//   3. goal (active) χωρίς μέτρηση >14 ημέρες (attention 'stale') → 'recordMeasurement'
//   4. μηδέν goals ΣΥΝΟΛΙΚΑ (ανεξαρτήτως status)         → 'createFirstGoal'
//   5. διαφορετικά                                        → 'allCaughtUp'
//
// goals: ΟΛΟΙ οι στόχοι του μαθητή (raw, με status/studentId/criterion/measurementType/priority).
// datedMeasurementsByGoalId/goalEventsByGoalId: {[goalId]: [...]} — ήδη ομαδοποιημένα από τον
// καλούντα (batched φόρτωση, βλ. σημείο 8), ΚΑΜΙΑ query εδώ μέσα.
export function computeNextBestAction({
  hasIncompleteSessionToday,
  todaySessionStudentIds,
  goals,
  datedMeasurementsByGoalId,
  goalEventsByGoalId,
  today
}) {
  if (hasIncompleteSessionToday) {
    return { type: 'startSession', label: 'Ξεκίνα τη συνεδρία', studentIds: todaySessionStudentIds }
  }

  const activeGoals = goals.filter((g) => g.status === 'active').sort((a, b) => a.id - b.id)

  for (const g of activeGoals) {
    const measurements = datedMeasurementsByGoalId[g.id] || []
    if (isCompletionCandidate(g, measurements)) {
      return { type: 'reviewCompletion', label: 'Εξέτασε αν ολοκληρώθηκε', goalId: g.id, studentId: g.studentId }
    }
  }

  let staleCandidate = null
  for (const g of activeGoals) {
    const attention = computeGoalAttention(
      g,
      datedMeasurementsByGoalId[g.id] || [],
      goalEventsByGoalId[g.id] || [],
      today
    )
    const staleReason = attention?.reasons.find((r) => r.type === 'stale')
    if (staleReason && (!staleCandidate || staleReason.days > staleCandidate.days)) {
      staleCandidate = { goalId: g.id, studentId: g.studentId, days: staleReason.days }
    }
  }
  if (staleCandidate) {
    return { type: 'recordMeasurement', label: 'Κατάγραψε νέα μέτρηση', goalId: staleCandidate.goalId, studentId: staleCandidate.studentId }
  }

  if (goals.length === 0) {
    return { type: 'createFirstGoal', label: 'Δημιούργησε τον πρώτο στόχο' }
  }

  return { type: 'allCaughtUp', label: 'Όλα ενημερωμένα — καμία άμεση ενέργεια' }
}
