// Βήματα εργασίας — Technical Plan Στάδιο 1. criterionConfig: { steps: {id, label}[], targetCompletedCount }.
// Η σειρά των βημάτων είναι η σειρά του array (κανένα ξεχωριστό πεδίο order — θα ήταν πηγή
// αναντιστοιχίας). Σταθερό, κλειστό σύνολο βημάτων (απόφαση χρήστη ⑤α) — καμία ανοιχτή ακολουθία.
import { notComputable, computed, ratioProgressPercent, ratioMeets, ratioIsNear } from './_shared.js'
import { parseCriterionTarget } from '../measurementValue.js'

export const value = 'taskAnalysis'
export const label = 'Βήματα εργασίας'
export const icon = '🪜'
export const kind = 'ratio'

export function createEmptyCriterionConfig() {
  return { steps: [], targetCompletedCount: null }
}

export function validateCriterionConfig(config) {
  if (!config || !Array.isArray(config.steps) || config.steps.length === 0) {
    throw new Error('Τα «Βήματα εργασίας» χρειάζονται τουλάχιστον ένα βήμα.')
  }
  config.steps.forEach((step, index) => {
    if (!step || !step.label || !step.label.trim()) {
      throw new Error(`Το βήμα ${index + 1} χρειάζεται τίτλο.`)
    }
  })
  const target = config.targetCompletedCount
  if (!Number.isInteger(target) || target < 1 || target > config.steps.length) {
    throw new Error('Ο στόχος ολοκληρωμένων βημάτων πρέπει να είναι από 1 έως τον συνολικό αριθμό βημάτων.')
  }
}

export function generateCriterionText(config) {
  return `${config.targetCompletedCount} από ${config.steps.length} βήματα ανεξάρτητα`
}

export function legacyCriterionText(goal) {
  return goal.criterion || ''
}

// Δύο δυνατά σχήματα μέτρησης, διακρίνονται από το αν ο στόχος έχει criterionConfig (νέος,
// δομημένος, ονομαστική λίστα βημάτων — Στάδιο 7/8) ή όχι (legacy, απλός μετρητής, όπως σήμερα).
function completedCount(measurementValue, structured) {
  if (structured) {
    if (!measurementValue || !Array.isArray(measurementValue.completedStepIds)) return null
    return measurementValue.completedStepIds.length
  }
  if (!measurementValue || !Number.isFinite(measurementValue.stepsCompleted)) return null
  return measurementValue.stepsCompleted
}

// criterionConfig.targetCompletedCount (νέο) ή parseCriterionTarget στο legacy ελεύθερο κείμενο —
// για taskAnalysis αυτό επιστρέφει ήδη τον στόχο-αριθμό ολοκληρωμένων βημάτων, όχι ποσοστό.
function resolveTarget(criterionConfig, criterionText) {
  if (criterionConfig) return criterionConfig.targetCompletedCount
  return parseCriterionTarget(criterionText, 'taskAnalysis')
}

export function formatRecordedValue(measurementValue, criterionConfig) {
  const structured = !!criterionConfig
  const completed = completedCount(measurementValue, structured)
  if (completed === null) return '—'
  const total = structured ? criterionConfig.steps.length : null
  return total != null ? `${completed} από ${total} βήματα` : `${completed} βήματα`
}

export const supportsProgress = true
export const supportsNearCriterion = true

export function computeProgressPercent(measurementValue, { criterionConfig, criterionText } = {}) {
  const structured = !!criterionConfig
  const completed = completedCount(measurementValue, structured)
  const target = resolveTarget(criterionConfig, criterionText)
  const pct = ratioProgressPercent(completed, target)
  if (pct === null) return notComputable()
  return computed(pct)
}

export function meetsCriterion(measurementValue, { criterionConfig, criterionText } = {}) {
  const structured = !!criterionConfig
  const completed = completedCount(measurementValue, structured)
  const target = resolveTarget(criterionConfig, criterionText)
  const meets = ratioMeets(completed, target)
  if (meets === null) return notComputable()
  return computed(meets)
}

// near = λείπει ΑΚΡΙΒΩΣ 1 βήμα (Product Design §3) — ΙΔΙΟΣ κανόνας structured ΚΑΙ legacy (διόρθωση
// χρήστη Σταδίου 2, σημείο 1: το legacy ΔΕΝ συγκρίνει πλέον με ανεξάρτητο flat 90% ποσοστό).
export function isNearCriterion(measurementValue, { criterionConfig, criterionText } = {}) {
  const structured = !!criterionConfig
  const completed = completedCount(measurementValue, structured)
  const target = resolveTarget(criterionConfig, criterionText)
  const near = ratioIsNear(completed, target)
  if (near === null) return notComputable()
  return computed(near)
}

// near σημαίνει ΠΑΝΤΑ «λείπει ακριβώς 1 βήμα» (ratioIsNear, ΙΔΙΟΣ κανόνας structured/legacy) —
// σταθερό κείμενο, καμία ανάγκη επανυπολογισμού (η κλήση προϋποθέτει ήδη isNearCriterion:true).
export function describeNearCriterion() {
  return 'Απομένει 1 βήμα για επίτευξη'
}
