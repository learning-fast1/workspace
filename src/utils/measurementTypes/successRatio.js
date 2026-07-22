// Ποσοστό επιτυχίας — Technical Plan Στάδιο 1. criterionConfig: { targetSuccesses, targetAttempts }.
// ΟΧΙ targetPercent — διατηρεί τη σημασιολογία που επέλεξε ο εκπαιδευτικός («4 από 5»), το ποσοστό
// είναι πάντα παράγωγη τιμή, ποτέ αποθηκευμένη (ρητή απόφαση χρήστη, βλ. Product Design §3).
import { notComputable, computed } from './_shared.js'
import { parseCriterionTarget } from '../measurementValue.js'

export const value = 'successRatio'
export const label = 'Ποσοστό επιτυχίας'
export const icon = '📈'
export const kind = 'ratio'

export function createEmptyCriterionConfig() {
  return { targetSuccesses: null, targetAttempts: null }
}

export function validateCriterionConfig(config) {
  if (!config || typeof config.targetSuccesses !== 'number' || typeof config.targetAttempts !== 'number') {
    throw new Error('Το κριτήριο «Ποσοστό επιτυχίας» χρειάζεται αριθμό επιτυχιών και αριθμό προσπαθειών.')
  }
  if (!Number.isInteger(config.targetAttempts) || config.targetAttempts <= 0) {
    throw new Error('Ο αριθμός προσπαθειών πρέπει να είναι ακέραιος μεγαλύτερος από μηδέν.')
  }
  if (!Number.isInteger(config.targetSuccesses) || config.targetSuccesses < 0 || config.targetSuccesses > config.targetAttempts) {
    throw new Error('Ο αριθμός επιτυχιών πρέπει να είναι ακέραιος από 0 έως τον αριθμό προσπαθειών.')
  }
}

export function generateCriterionText(config) {
  return `${config.targetSuccesses} από ${config.targetAttempts} προσπάθειες`
}

// Legacy goal (χωρίς criterionConfig) — το ήδη υπάρχον ελεύθερο κείμενο, αμετάβλητο.
export function legacyCriterionText(goal) {
  return goal.criterion || ''
}

export function formatRecordedValue(value) {
  if (!value || !Number.isFinite(value.attempts) || value.attempts <= 0) return '—'
  const pct = Math.round((value.successes / value.attempts) * 100)
  return `${value.successes}/${value.attempts} (${pct}%)`
}

export const supportsProgress = true
export const supportsNearCriterion = true

// 90% της τιμής-στόχου (Product Design §3) — ΙΔΙΟΣ τύπος κανόνα για structured ΚΑΙ legacy μονοπάτι
// (Technical Plan Στάδιο 2, διόρθωση χρήστη #1: το legacy ΔΕΝ αγνοεί πλέον το πραγματικό criterion
// με ένα flat 90% ακατέργαστο ποσοστό — θα ήταν ακριβώς η «γνωστή λανθασμένη συμπεριφορά» που δεν
// θέλει να διατηρηθεί μόνο για συμβατότητα με παλιά tests).
export const NEAR_CRITERION_RATIO = 0.9

function actualPercent(measurementValue) {
  if (!measurementValue || !Number.isFinite(measurementValue.successes) || !Number.isFinite(measurementValue.attempts) || measurementValue.attempts <= 0) {
    return null
  }
  return (measurementValue.successes / measurementValue.attempts) * 100
}

// criterionConfig (νέο) ή parseCriterionTarget πάνω στο ελεύθερο criterionText (legacy) — αν το
// legacy κείμενο δεν parse-άρεται με ασφάλεια, null (καμία μαντεψιά, σημείο 1).
function resolveTargetPercent(criterionConfig, criterionText) {
  if (criterionConfig) return (criterionConfig.targetSuccesses / criterionConfig.targetAttempts) * 100
  return parseCriterionTarget(criterionText, 'successRatio')
}

// Πραγματική επίδοση — ΠΟΤΕ σχετική με τον στόχο (Technical Plan Στάδιο 2, σημείο 5: το Στάδιο 9
// θα εμφανίσει το criterion ΔΙΠΛΑ στο ποσοστό, όχι μέσα στον ίδιο αριθμό — «60% επιτυχία · στόχος 80%»).
export function computeProgressPercent(measurementValue) {
  const pct = actualPercent(measurementValue)
  if (pct === null) return notComputable()
  return computed(Math.round(pct))
}

export function meetsCriterion(measurementValue, { criterionConfig, criterionText } = {}) {
  const pct = actualPercent(measurementValue)
  const target = resolveTargetPercent(criterionConfig, criterionText)
  if (pct === null || target === null) return notComputable()
  return computed(pct >= target)
}

export function isNearCriterion(measurementValue, { criterionConfig, criterionText } = {}) {
  const pct = actualPercent(measurementValue)
  const target = resolveTargetPercent(criterionConfig, criterionText)
  if (pct === null || target === null) return notComputable()
  if (pct >= target) return computed(false) // ήδη πέτυχε τον στόχο — meets, όχι near
  return computed(pct >= target * NEAR_CRITERION_RATIO)
}

// Ανθρώπινη, ΣΥΓΚΕΚΡΙΜΕΝΗ περιγραφή αντί για γενική ετικέτα «Κοντά στο κριτήριο» (Sprint 7 feedback
// χρήστη — widget «Χρειάζονται προσοχή») — καλείται ΜΟΝΟ αφού το isNearCriterion έχει ήδη
// επιστρέψει computable:true/value:true (goalAttention.js), άρα δεν ξαναελέγχει «near».
export function describeNearCriterion(measurementValue) {
  const pct = actualPercent(measurementValue)
  if (pct === null) return null
  return `${Math.round(pct)}% επιτυχία`
}
