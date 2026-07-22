// Κλίμακα 1–5 — Technical Plan Στάδιο 1. criterionConfig: { targetLevel, levelDescriptions }.
// ΚΑΙ οι 5 περιγραφές είναι υποχρεωτικές, χωρίς εξαίρεση (τελική απόφαση χρήστη) — αποτρέπει
// ασαφείς κλίμακες τύπου «1=κακό, 5=καλό». Το UI (Στάδιο 6) δείχνει ενδεικτικό παράδειγμα ως
// placeholder, ΠΟΤΕ προσυμπληρωμένη πραγματική τιμή — εδώ απλώς επιβάλλεται ότι και οι 5 υπάρχουν.
// Καμία legacy — brand new τύπος.
import { notComputable, computed } from './_shared.js'

export const value = 'ratingScale'
export const label = 'Κλίμακα 1–5'
export const icon = '⭐'
export const kind = 'graduated'

export function createEmptyCriterionConfig() {
  return { targetLevel: null, levelDescriptions: { 1: '', 2: '', 3: '', 4: '', 5: '' } }
}

export function validateCriterionConfig(config) {
  if (!config || !Number.isInteger(config.targetLevel) || config.targetLevel < 1 || config.targetLevel > 5) {
    throw new Error('Η «Κλίμακα 1–5» χρειάζεται επιλεγμένη βαθμίδα-στόχο από 1 έως 5.')
  }
  const descriptions = config.levelDescriptions || {}
  for (let level = 1; level <= 5; level++) {
    const text = descriptions[level]
    if (!text || !text.trim()) {
      throw new Error(`Χρειάζεται περιγραφή για τη βαθμίδα ${level} (και οι 5 περιγραφές είναι υποχρεωτικές).`)
    }
  }
}

export function generateCriterionText(config) {
  return `Επίπεδο ${config.targetLevel} — «${config.levelDescriptions[config.targetLevel]}»`
}

// Ποτέ δεν καλείται στην πράξη — καμία υπάρχουσα βάση δεν έχει goals αυτού του τύπου (νέος τύπος).
export function legacyCriterionText(goal) {
  return goal.criterion || ''
}

function levelOf(measurementValue) {
  if (!measurementValue || !Number.isInteger(measurementValue.level) || measurementValue.level < 1 || measurementValue.level > 5) return null
  return measurementValue.level
}

export function formatRecordedValue(measurementValue, criterionConfig) {
  const level = levelOf(measurementValue)
  if (level === null) return '—'
  const desc = criterionConfig?.levelDescriptions?.[level]
  return desc ? `Επίπεδο ${level} — «${desc}»` : `Επίπεδο ${level}`
}

export const supportsProgress = false // διαβάθμιση, όχι αναλογία (Product Design §3)
export const supportsNearCriterion = true

export function computeProgressPercent() {
  return notComputable()
}

export function meetsCriterion(measurementValue, { criterionConfig } = {}) {
  const level = levelOf(measurementValue)
  const target = criterionConfig ? criterionConfig.targetLevel : null
  if (level === null || !Number.isInteger(target)) return notComputable()
  return computed(level >= target)
}

// near = π.χ. «4» όταν ο στόχος είναι «5» (Product Design §3) — μία βαθμίδα κάτω από τον στόχο.
export function isNearCriterion(measurementValue, { criterionConfig } = {}) {
  const level = levelOf(measurementValue)
  const target = criterionConfig ? criterionConfig.targetLevel : null
  if (level === null || !Number.isInteger(target)) return notComputable()
  if (level >= target) return computed(false)
  return computed(target - level === 1)
}

// near σημαίνει ΠΑΝΤΑ «ακριβώς 1 βαθμίδα κάτω από τον στόχο» — σταθερό κείμενο.
export function describeNearCriterion() {
  return 'Απομένει 1 βαθμίδα για επίτευξη'
}
