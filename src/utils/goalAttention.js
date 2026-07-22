import { latestDatedMeasurement } from './measurementValue.js'
import { isNearCriterion, describeNearCriterion } from './measurementTypes/index.js'

// Product defaults για το Sprint 7 attention system (Technical Plan Στάδιο 8, σημείο 2) — ΟΧΙ
// ρυθμιζόμενα από τον εκπαιδευτικό σε αυτό το sprint. Το pausedTooLong εκφράζεται σε ΗΜΕΡΕΣ εδώ,
// ακόμα κι αν κάποιο μελλοντικό UI το περιγράφει σε εβδομάδες (42 ημέρες = 6 εβδομάδες) — η μονάδα
// της pure function είναι πάντα ημέρες, η μετάφραση σε «εβδομάδες» είναι καθαρά παρουσίαση.
//
// ΣΗΜΕΙΩΣΗ (Goal Wizard Step 3 redesign, Technical Plan Στάδιο 2): το GOAL_NEAR_CRITERION_RATIO
// που ζούσε εδώ αφαιρέθηκε — η έννοια «κοντά στο κριτήριο» δεν είναι πια ενιαία σε όλους τους
// τύπους (π.χ. το promptLevel δεν έχει καθόλου ποσοστό, το frequency χρησιμοποιεί «ακριβώς 1
// μονάδα» όχι αναλογία). Κάθε τύπος δηλώνει ΤΟΝ ΔΙΚΟ ΤΟΥ κανόνα στο utils/measurementTypes/ — το
// ισοδύναμο για successRatio ζει πλέον ως NEAR_CRITERION_RATIO στο successRatio.js.
export const GOAL_STALE_DAYS = 14
export const GOAL_PAUSED_TOO_LONG_DAYS = 42

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Σειρά σοβαρότητας για deterministic ταξινόμηση (σημείο 8) — ΑΝΑΘΕΩΡΗΘΗΚΕ μετά από feedback
// χρήστη (widget «Χρειάζονται προσοχή», καθημερινή χρήση): stale πρώτα (ένας στόχος χωρίς καμία
// καταγραφή για πολλές μέρες χρειάζεται ΑΜΕΣΗ ενέργεια — ρίσκο να «χαθεί» τελείως), μετά
// pausedTooLong (χρειάζεται απόφαση για το αν θα συνεχίσει), τελευταία nearCriterion (θετικό
// σημάδι προόδου, όχι επείγον πρόβλημα — ο εκπαιδευτικός το βλέπει έτσι κι αλλιώς στο chart).
// Ρητά τεκμηριωμένη εδώ ώστε τα Στάδια 12/13 να μη χρειάζονται δική τους λογική ταξινόμησης.
const REASON_PRIORITY = { stale: 0, pausedTooLong: 1, nearCriterion: 2 }

// Ακέραιος αριθμός πλήρων ημερών ανάμεσα σε ένα ISO date string και το `today` — ΠΟΤΕ new Date()
// εσωτερικά, το `today` περνάει πάντα ως παράμετρος (σημείο 7 — πλήρως deterministic tests).
function daysBetween(fromDateStr, today) {
  const from = new Date(fromDateStr)
  return Math.floor((today.getTime() - from.getTime()) / MS_PER_DAY)
}

// «Χωρίς μέτρηση» (σημείο 3): reference date = η πιο πρόσφατη ΈΓΚΥΡΗ μέτρηση (date-joined, βλ.
// latestDatedMeasurement) — αν δεν υπάρχει καμία μέτρηση, πέφτει πίσω στο startDate του στόχου
// (ΠΟΤΕ δεν θεωρείται stale ένας φρέσκος στόχος μόνο επειδή δεν έχει προλάβει να μετρηθεί ακόμα
// σήμερα). Όριο: ΑΥΣΤΗΡΑ μεγαλύτερο από GOAL_STALE_DAYS (days > 14, όχι >=) — η μέρα 14 ΔΕΝ
// είναι ακόμα stale, η μέρα 15 είναι. Μόνο για status:'active' (καλείται από τον caller — βλ.
// computeGoalAttention).
function computeStaleReason(goal, measurements, today) {
  const latest = latestDatedMeasurement(measurements)
  const referenceDate = latest?.date || goal.startDate
  if (!referenceDate) return null
  const days = daysBetween(referenceDate, today)
  if (days > GOAL_STALE_DAYS) {
    return { type: 'stale', since: referenceDate, days, label: `Χωρίς μέτρηση ${days} ημέρες` }
  }
  return null
}

// nearCriterion (σημείο 4, αναθεωρημένο στο Στάδιο 2): χρησιμοποιεί ΑΠΟΚΛΕΙΣΤΙΚΑ το registry
// (utils/measurementTypes/index.js) — κάθε τύπος αποφασίζει ΤΟΝ ΔΙΚΟ ΤΟΥ κανόνα «κοντά», αυτό το
// αρχείο απλώς ρωτάει. context = { criterionConfig, criterionText } — legacy goals (χωρίς
// criterionConfig) πέφτουν πίσω στο parseCriterionTarget ΜΕΣΑ στο ίδιο το module, ΟΧΙ εδώ. Όταν
// result.computable είναι false (άγνωστος τύπος πληροφορίας, ασαφές legacy κείμενο, τύπος χωρίς
// υποστήριξη) ή result.value false, το reason ΔΕΝ παράγεται — καμία μαντεψιά.
function computeNearCriterionReason(goal, measurements) {
  const latest = latestDatedMeasurement(measurements)
  if (!latest) return null
  const context = { criterionConfig: goal.criterionConfig, criterionText: goal.criterion }
  const result = isNearCriterion(goal.measurementType, latest.value, context)
  if (!result.computable || !result.value) return null
  // Τύπο-ειδική, actionable περιγραφή (Sprint 7 feedback χρήστη) — «96% επιτυχία», «Απομένει 1
  // βήμα για επίτευξη», κ.λπ. αντί για γενική ετικέτα. Γενικό fallback μόνο για την απίθανη
  // περίπτωση που ο τύπος δεν έχει ακόμα δικό του describeNearCriterion.
  const label = describeNearCriterion(goal.measurementType, latest.value, context) || 'Κοντά στο κριτήριο'
  return { type: 'nearCriterion', label }
}

// Το ΠΙΟ ΠΡΟΣΦΑΤΟ goalEvent μετάβασης ΣΕ 'paused' — ΠΟΤΕ goal.statusChangedAt απευθείας (σημείο
// 5): το statusChangedAt είναι ένα μοναδικό, αντικαθιστάμενο πεδίο· το goalEvents log είναι η
// authoritative, ποτέ-ξαναγραμμένη πηγή (ίδια αρχή με το Στάδιο 5 — ταξινόμηση/αφήγηση βασισμένη
// σε events, όχι σε status/statusChangedAt). Pure — δέχεται τα ΗΔΗ φορτωμένα goalEvents ως
// παράμετρο, καμία query εδώ μέσα.
function findMostRecentPausedTransition(goalEvents) {
  const pausedEvents = goalEvents.filter((e) => e.type === 'statusChanged' && e.toStatus === 'paused')
  if (pausedEvents.length === 0) return null
  return pausedEvents.reduce((latest, e) => (!latest || e.at > latest.at ? e : latest), null)
}

// pausedTooLong: αν δεν βρεθεί αξιόπιστο goalEvent μετάβασης σε paused μέσα στα δοσμένα
// goalEvents, το reason ΔΕΝ παράγεται — ΚΑΜΙΑ μαντεψιά μέσω άλλου πεδίου. Όριο: days >
// GOAL_PAUSED_TOO_LONG_DAYS (αυστηρά μεγαλύτερο, ίδιο σκεπτικό με το stale).
function computePausedTooLongReason(goalEvents, today) {
  const pausedEvent = findMostRecentPausedTransition(goalEvents)
  if (!pausedEvent) return null
  const since = pausedEvent.at.slice(0, 10)
  const days = daysBetween(since, today)
  if (days > GOAL_PAUSED_TOO_LONG_DAYS) {
    return { type: 'pausedTooLong', since, days, label: `Σε παύση ${days} ημέρες` }
  }
  return null
}

// Υπολογίζει όλους τους λόγους «χρειάζεται προσοχή» για ΕΝΑ goal. Pure — δεν μεταλλάσσει
// goal/measurements/goalEvents, δεν διαβάζει new Date() (το `today` περνάει πάντα ως παράμετρος).
//
// Καταστάσεις-φύλακες (σημείο 9 — «active goals ποτέ pausedTooLong», «paused goals ποτέ stale ή
// nearCriterion»): nearCriterion/stale ΜΟΝΟ για status:'active' — δεν έχει νόημα να «χρειάζεται
// μέτρηση» ή «κοντά στο κριτήριο» ένας στόχος που δεν μετριέται πια (paused/achieved/archived).
// pausedTooLong ΜΟΝΟ για status:'paused'.
//
// measurements: array μετρήσεων ΤΟΥ ΣΥΓΚΕΚΡΙΜΕΝΟΥ goal, ΗΔΗ date-joined (κάθε στοιχείο έχει πεδίο
// `date` — βλ. latestDatedMeasurement). goalEvents: array goalEvents ΤΟΥ ΣΥΓΚΕΚΡΙΜΕΝΟΥ goal (ο
// caller είναι υπεύθυνος να τα έχει ήδη φιλτράρει/φορτώσει — βλ. computeAttentionForStudent
// παρακάτω για το πώς προτείνεται να παρέχονται αποδοτικά, χωρίς N+1).
//
// Επιστρέφει null αν δεν υπάρχει κανένας λόγος (ώστε ο caller να κάνει απλό `if (result)`),
// αλλιώς { goalId, reasons: [...] } — ΠΟΤΕ μόνο strings, ώστε το UI να μπορεί να εξηγήσει το
// «γιατί» χωρίς να ξαναϋπολογίσει τίποτα (σημείο 6).
export function computeGoalAttention(goal, measurements, goalEvents, today) {
  const reasons = []

  if (goal.status === 'active') {
    const nearCriterion = computeNearCriterionReason(goal, measurements)
    if (nearCriterion) reasons.push(nearCriterion)

    const stale = computeStaleReason(goal, measurements, today)
    if (stale) reasons.push(stale)
  } else if (goal.status === 'paused') {
    const pausedTooLong = computePausedTooLongReason(goalEvents, today)
    if (pausedTooLong) reasons.push(pausedTooLong)
  }

  if (reasons.length === 0) return null
  return { goalId: goal.id, reasons }
}

function attentionRank(entry) {
  return Math.min(...entry.reasons.map((r) => REASON_PRIORITY[r.type] ?? 99))
}

// Ομαδοποιεί flat arrays (measurements/goalEvents ΟΛΩΝ των στόχων ενός μαθητή — το φυσικό
// αποτέλεσμα ενός .where('studentId').equals(...).toArray()/.where('goalId').anyOf(...).toArray()
// query, βλ. Στάδιο 5 για το ίδιο idiom) σε maps ανά goalId. Pure — reduce σε ΝΕΟ αντικείμενο,
// καμία μετάλλαξη του input array.
function groupByGoalId(items) {
  return items.reduce((map, item) => {
    if (!map[item.goalId]) map[item.goalId] = []
    map[item.goalId].push(item)
    return map
  }, {})
}

// Υπολογίζει το attention ΟΛΩΝ των goals ενός μαθητή. goals/measurements/goalEvents: flat arrays
// (ήδη φορτωμένα από τον caller, matching το idiom του GoalsList.jsx/StudentTimeline.jsx — ΕΝΑ
// query ανά πίνακα, όχι ανά goal). Deterministic σειρά: attentionRank (§ σχόλιο REASON_PRIORITY
// παραπάνω), tie-break κατά goalId αύξουσα.
export function computeAttentionForStudent(goals, measurements, goalEvents, today) {
  const measurementsByGoalId = groupByGoalId(measurements)
  const goalEventsByGoalId = groupByGoalId(goalEvents)

  const results = []
  for (const goal of goals) {
    const result = computeGoalAttention(goal, measurementsByGoalId[goal.id] || [], goalEventsByGoalId[goal.id] || [], today)
    if (result) results.push(result)
  }

  return [...results].sort((a, b) => attentionRank(a) - attentionRank(b) || a.goalId - b.goalId)
}

// Cross-student έκδοση (Στάδιο 13, Home widget) — entries: [{ studentId, goals, measurements,
// goalEvents }, ...], ΕΝΑ στοιχείο ανά μαθητή με ΗΔΗ φορτωμένα (flat, ίδιο idiom) δεδομένα ΤΟΥ
// ΣΥΓΚΕΚΡΙΜΕΝΟΥ μαθητή — η αποδοτική συλλογή (batched queries, καμία N+1) είναι ευθύνη του caller.
//
// ΕΝΑ αποτέλεσμα ανά goal (ποτέ διπλότυπο όταν έχει πολλαπλούς λόγους — όλοι οι λόγοι ζουν στο
// ΙΔΙΟ reasons array, βλ. computeGoalAttention). Deterministic σειρά: attentionRank, μετά
// studentId, μετά goalId.
export function computeAttentionAcrossStudents(entries, today) {
  const results = []
  for (const { studentId, goals, measurements, goalEvents } of entries) {
    const measurementsByGoalId = groupByGoalId(measurements)
    const goalEventsByGoalId = groupByGoalId(goalEvents)
    for (const goal of goals) {
      const result = computeGoalAttention(goal, measurementsByGoalId[goal.id] || [], goalEventsByGoalId[goal.id] || [], today)
      if (result) results.push({ studentId, ...result })
    }
  }

  return [...results].sort((a, b) => {
    const rankDiff = attentionRank(a) - attentionRank(b)
    if (rankDiff !== 0) return rankDiff
    if (a.studentId !== b.studentId) return a.studentId - b.studentId
    return a.goalId - b.goalId
  })
}
