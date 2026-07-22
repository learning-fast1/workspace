// Διάρκεια — Technical Plan Στάδιο 1. criterionConfig: { direction, targetMinutes, context? }.
// Ρητή κατεύθυνση υποχρεωτική (απόφαση χρήστη ③) — «αύξηση» και «μείωση» έχουν αντίθετη σημασία
// για near-criterion/completion, δεν μπορεί να συναχθεί σιωπηλά.
import { notComputable, computed } from './_shared.js'

export const value = 'duration'
export const label = 'Διάρκεια'
export const icon = '⏱️'
export const kind = 'measure'

const VALID_DIRECTIONS = ['increase', 'decrease']

export function createEmptyCriterionConfig() {
  return { direction: null, targetMinutes: null, context: '' }
}

// targetMinutes — το κατώτερο επιτρεπτό όριο εξαρτάται από την κατεύθυνση (διόρθωση Σταδίου 5):
// μείωση επιτρέπει 0 (π.χ. «μείωση σε 0 λεπτά» — εξάλειψη μιας διασπαστικής συμπεριφοράς, πραγματικός
// στόχος), αλλά αύξηση ΠΡΕΠΕΙ να είναι αυστηρά > 0 — «αύξηση σε 0 λεπτά» δεν έχει νόημα.
export function validateCriterionConfig(config) {
  if (!config || !VALID_DIRECTIONS.includes(config.direction)) {
    throw new Error('Η «Διάρκεια» χρειάζεται ρητή κατεύθυνση: αύξηση ή μείωση.')
  }
  if (typeof config.targetMinutes !== 'number') {
    throw new Error('Η «Διάρκεια» χρειάζεται στόχο λεπτών.')
  }
  if (config.direction === 'increase' && config.targetMinutes <= 0) {
    throw new Error('Για αύξηση, ο στόχος λεπτών πρέπει να είναι μεγαλύτερος από μηδέν.')
  }
  if (config.direction === 'decrease' && config.targetMinutes < 0) {
    throw new Error('Η «Διάρκεια» χρειάζεται στόχο λεπτών, μηδέν ή μεγαλύτερο.')
  }
}

export function generateCriterionText(config) {
  const directionText = config.direction === 'increase' ? 'Αύξηση σε τουλάχιστον' : 'Μείωση σε το πολύ'
  const contextText = config.context && config.context.trim() ? ` ${config.context.trim()}` : ''
  return `${directionText} ${config.targetMinutes}′${contextText}`
}

export function legacyCriterionText(goal) {
  return goal.criterion || ''
}

function minutesOf(measurementValue) {
  if (!measurementValue || !Number.isFinite(measurementValue.minutes)) return null
  return measurementValue.minutes
}

export function formatRecordedValue(measurementValue) {
  const minutes = minutesOf(measurementValue)
  return minutes === null ? '—' : `${minutes} λεπτά`
}

export const supportsProgress = false // κανένα έμφυτο 100% (Product Design §3)
export const supportsNearCriterion = true

const MIN_TOLERANCE_MINUTES = 1
const TOLERANCE_RATIO = 0.1

// tolerance = max(1, targetMinutes×10%) — διόρθωση Σταδίου 2, σημείο 3: ένα καθαρό 10% αποτυγχάνει
// για μικρούς στόχους (π.χ. 5 λεπτά → tolerance 0.5 θα ήταν σχεδόν άχρηστο)· το ελάχιστο 1 λεπτό
// εγγυάται πρακτικό περιθώριο ακόμα και όταν targetMinutes είναι μικρό ή 0.
function toleranceFor(targetMinutes) {
  return Math.max(MIN_TOLERANCE_MINUTES, targetMinutes * TOLERANCE_RATIO)
}

export function computeProgressPercent() {
  return notComputable()
}

// Legacy duration ΔΕΝ έχει κατεύθυνση αποθηκευμένη πουθενά (ελεύθερο κείμενο, καμία δομή) — καμία
// μαντεψιά, πάντα not computable (ίδιο σκεπτικό με το ήδη υπάρχον studentDashboard.js, όπου το
// duration αποκλειόταν ρητά από completion candidate — behavior-preserving, όχι νέος αποκλεισμός).
export function meetsCriterion(measurementValue, { criterionConfig } = {}) {
  const minutes = minutesOf(measurementValue)
  if (minutes === null || !criterionConfig || !VALID_DIRECTIONS.includes(criterionConfig.direction)) return notComputable()
  const { direction, targetMinutes } = criterionConfig
  return computed(direction === 'increase' ? minutes >= targetMinutes : minutes <= targetMinutes)
}

export function isNearCriterion(measurementValue, { criterionConfig } = {}) {
  const minutes = minutesOf(measurementValue)
  if (minutes === null || !criterionConfig || !VALID_DIRECTIONS.includes(criterionConfig.direction)) return notComputable()
  const { direction, targetMinutes } = criterionConfig
  const tolerance = toleranceFor(targetMinutes)
  if (direction === 'increase') {
    if (minutes >= targetMinutes) return computed(false)
    return computed(minutes >= targetMinutes - tolerance)
  }
  if (minutes <= targetMinutes) return computed(false)
  return computed(minutes <= targetMinutes + tolerance)
}

function minutesRemainingLabel(remaining) {
  return remaining === 1 ? 'Απομένει 1 λεπτό για επίτευξη' : `Απομένουν ${remaining} λεπτά για επίτευξη`
}

function minutesOverLabel(over) {
  return over === 1 ? '1 λεπτό πάνω από τον στόχο' : `${over} λεπτά πάνω από τον στόχο`
}

// Σε αντίθεση με τα υπόλοιπα «near = ακριβώς 1 μονάδα» (frequency/checklist/taskAnalysis), εδώ η
// απόσταση ΔΕΝ είναι πάντα 1 λεπτό (tolerance-based, βλ. toleranceFor) — άρα δείχνουμε τα
// ΠΡΑΓΜΑΤΙΚΑ λεπτά που απομένουν/περισσεύουν, πιο χρήσιμο από ένα σταθερό κείμενο.
export function describeNearCriterion(measurementValue, { criterionConfig } = {}) {
  const minutes = minutesOf(measurementValue)
  if (minutes === null || !criterionConfig) return null
  const { direction, targetMinutes } = criterionConfig
  const remaining = direction === 'increase' ? targetMinutes - minutes : minutes - targetMinutes
  if (remaining <= 0) return null
  return direction === 'increase' ? minutesRemainingLabel(remaining) : minutesOverLabel(remaining)
}
