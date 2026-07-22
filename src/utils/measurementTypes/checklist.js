// Checklist — Technical Plan Στάδιο 1. criterionConfig: { items: {id, label}[], targetCompletedCount }.
// Ξεχωριστός τύπος από «Βήματα εργασίας» (απόφαση χρήστη ②) — εδώ η σειρά ΔΕΝ έχει σημασία,
// απλώς ένα σύνολο στοιχείων που πρέπει να ολοκληρωθούν. Καμία legacy — brand new τύπος.
import { notComputable, computed, ratioProgressPercent, ratioMeets, ratioIsNear } from './_shared.js'

export const value = 'checklist'
export const label = 'Λίστα ελέγχου'
export const icon = '✔️'
export const kind = 'ratio'

export function createEmptyCriterionConfig() {
  return { items: [], targetCompletedCount: null }
}

export function validateCriterionConfig(config) {
  if (!config || !Array.isArray(config.items) || config.items.length === 0) {
    throw new Error('Το «Checklist» χρειάζεται τουλάχιστον ένα στοιχείο.')
  }
  config.items.forEach((item, index) => {
    if (!item || !item.label || !item.label.trim()) {
      throw new Error(`Το στοιχείο ${index + 1} χρειάζεται τίτλο.`)
    }
  })
  const target = config.targetCompletedCount
  if (!Number.isInteger(target) || target < 1 || target > config.items.length) {
    throw new Error('Ο στόχος ολοκληρωμένων στοιχείων πρέπει να είναι από 1 έως τον συνολικό αριθμό στοιχείων.')
  }
}

export function generateCriterionText(config) {
  return `${config.targetCompletedCount} από ${config.items.length} στοιχεία`
}

// Ποτέ δεν καλείται στην πράξη — καμία υπάρχουσα βάση δεν έχει goals αυτού του τύπου (νέος τύπος).
export function legacyCriterionText(goal) {
  return goal.criterion || ''
}

function completedCount(measurementValue) {
  if (!measurementValue || !Array.isArray(measurementValue.completedItemIds)) return null
  return measurementValue.completedItemIds.length
}

export function formatRecordedValue(measurementValue, criterionConfig) {
  const completed = completedCount(measurementValue)
  if (completed === null) return '—'
  const total = criterionConfig ? criterionConfig.items.length : null
  return total != null ? `${completed} από ${total} στοιχεία` : `${completed} στοιχεία`
}

export const supportsProgress = true
export const supportsNearCriterion = true

// Progress ΠΡΟΣ το criterion (targetCompletedCount), όχι προς το σύνολο της λίστας — διόρθωση
// χρήστη Σταδίου 2, σημείο 4: «5 από 6» σημαίνει 100% στα 5, όχι 83%.
export function computeProgressPercent(measurementValue, { criterionConfig } = {}) {
  const completed = completedCount(measurementValue)
  const target = criterionConfig ? criterionConfig.targetCompletedCount : null
  const pct = ratioProgressPercent(completed, target)
  if (pct === null) return notComputable()
  return computed(pct)
}

export function meetsCriterion(measurementValue, { criterionConfig } = {}) {
  const completed = completedCount(measurementValue)
  const target = criterionConfig ? criterionConfig.targetCompletedCount : null
  const meets = ratioMeets(completed, target)
  if (meets === null) return notComputable()
  return computed(meets)
}

export function isNearCriterion(measurementValue, { criterionConfig } = {}) {
  const completed = completedCount(measurementValue)
  const target = criterionConfig ? criterionConfig.targetCompletedCount : null
  const near = ratioIsNear(completed, target)
  if (near === null) return notComputable()
  return computed(near)
}

// near σημαίνει ΠΑΝΤΑ «λείπει ακριβώς 1 στοιχείο» (βλ. ratioIsNear στο _shared.js) — σταθερό
// κείμενο, καμία ανάγκη επανυπολογισμού (η κλήση προϋποθέτει ήδη isNearCriterion:true).
export function describeNearCriterion() {
  return 'Απομένει 1 στοιχείο για επίτευξη'
}
