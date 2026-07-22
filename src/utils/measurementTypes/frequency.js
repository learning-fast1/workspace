// Συχνότητα — Technical Plan Στάδιο 1. criterionConfig: { direction, targetCount, context? }.
// Ίδιο σκεπτικό ρητής κατεύθυνσης με το duration.js (απόφαση χρήστη ③). Καμία legacy — brand new τύπος.
import { notComputable, computed } from './_shared.js'

export const value = 'frequency'
export const label = 'Συχνότητα'
export const icon = '🔢'
export const kind = 'measure'

const VALID_DIRECTIONS = ['increase', 'decrease']

export function createEmptyCriterionConfig() {
  return { direction: null, targetCount: null, context: '' }
}

// targetCount — το κατώτερο επιτρεπτό όριο εξαρτάται από την κατεύθυνση (διόρθωση Σταδίου 5): μείωση
// επιτρέπει 0 (π.χ. «μείωση σε 0 επεισόδια» — πραγματικός στόχος), αλλά αύξηση ΠΡΕΠΕΙ να είναι
// αυστηρά > 0 — «αύξηση σε 0 φορές» δεν έχει νόημα.
export function validateCriterionConfig(config) {
  if (!config || !VALID_DIRECTIONS.includes(config.direction)) {
    throw new Error('Η «Συχνότητα» χρειάζεται ρητή κατεύθυνση: αύξηση ή μείωση.')
  }
  if (!Number.isInteger(config.targetCount)) {
    throw new Error('Η «Συχνότητα» χρειάζεται ακέραιο στόχο φορών.')
  }
  if (config.direction === 'increase' && config.targetCount <= 0) {
    throw new Error('Για αύξηση, ο στόχος φορών πρέπει να είναι μεγαλύτερος από μηδέν.')
  }
  if (config.direction === 'decrease' && config.targetCount < 0) {
    throw new Error('Η «Συχνότητα» χρειάζεται ακέραιο στόχο φορών, μηδέν ή μεγαλύτερο.')
  }
}

// Ελληνικός ενικός/πληθυντικός (bug report) — «1 φορά», ΟΧΙ «1 φορές». Μοναδική πηγή αλήθειας,
// χρησιμοποιείται ΚΑΙ από το generateCriterionText ΚΑΙ από το formatRecordedValue παρακάτω (ΚΑΙ
// έμμεσα από το GoalRecorder.jsx, που καλεί το formatRecordedValue αντί να διατυπώνει μόνο του).
function timesLabel(count) {
  return count === 1 ? '1 φορά' : `${count} φορές`
}

export function generateCriterionText(config) {
  const directionText = config.direction === 'increase' ? 'Αύξηση σε τουλάχιστον' : 'Μείωση σε το πολύ'
  const contextText = config.context && config.context.trim() ? ` ${config.context.trim()}` : ''
  return `${directionText} ${timesLabel(config.targetCount)}${contextText}`
}

// Ποτέ δεν καλείται στην πράξη — καμία υπάρχουσα βάση δεν έχει goals αυτού του τύπου (νέος τύπος).
export function legacyCriterionText(goal) {
  return goal.criterion || ''
}

function countOf(measurementValue) {
  if (!measurementValue || !Number.isInteger(measurementValue.count) || measurementValue.count < 0) return null
  return measurementValue.count
}

export function formatRecordedValue(measurementValue) {
  const count = countOf(measurementValue)
  return count === null ? '—' : timesLabel(count)
}

export const supportsProgress = false // κανένα έμφυτο 100% (Product Design §3)
export const supportsNearCriterion = true

export function computeProgressPercent() {
  return notComputable()
}

export function meetsCriterion(measurementValue, { criterionConfig } = {}) {
  const count = countOf(measurementValue)
  if (count === null || !criterionConfig || !VALID_DIRECTIONS.includes(criterionConfig.direction)) return notComputable()
  const { direction, targetCount } = criterionConfig
  return computed(direction === 'increase' ? count >= targetCount : count <= targetCount)
}

// near = απέχει ΑΚΡΙΒΩΣ 1 καταμέτρηση (ΟΧΙ ποσοστιαίο περιθώριο — διόρθωση Σταδίου 2, σημείο 2: το
// 10% αποτυγχάνει για μικρούς/μηδενικούς στόχους, π.χ. στόχος μείωσης σε 0 με τιμή 1). Πάντα μόνο
// όταν δεν έχει ήδη επιτευχθεί ο στόχος.
export function isNearCriterion(measurementValue, { criterionConfig } = {}) {
  const count = countOf(measurementValue)
  if (count === null || !criterionConfig || !VALID_DIRECTIONS.includes(criterionConfig.direction)) return notComputable()
  const { direction, targetCount } = criterionConfig
  if (direction === 'increase') {
    if (count >= targetCount) return computed(false)
    return computed(count === targetCount - 1)
  }
  if (count <= targetCount) return computed(false)
  return computed(count === targetCount + 1)
}

// near σημαίνει ΠΑΝΤΑ «απέχει ακριβώς 1 καταμέτρηση» — κατεύθυνση-ευαίσθητο κείμενο (αύξηση: λείπει
// ακόμη 1 καταγραφή· μείωση: υπάρχει 1 καταγραφή παραπάνω από τον στόχο).
export function describeNearCriterion(measurementValue, { criterionConfig } = {}) {
  if (!criterionConfig) return null
  return criterionConfig.direction === 'increase'
    ? 'Απομένει 1 καταγραφή για επίτευξη'
    : 'Χρειάζεται μείωση κατά 1 ακόμη για επίτευξη'
}
