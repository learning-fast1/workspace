// Επίπεδο υποστήριξης — Technical Plan Στάδιο 1. criterionConfig: { targetLevel }.
import { PROMPT_LEVELS, promptLevelLabel, PROMPT_LEVEL_RANK } from '../../config/promptLevels.js'
import { notComputable, computed } from './_shared.js'
import { parseCriterionTarget } from '../measurementValue.js'

export const value = 'promptLevel'
export const label = 'Επίπεδο υποστήριξης'
export const icon = '👐'
export const kind = 'graduated'

const VALID_LEVELS = PROMPT_LEVELS.map((p) => p.value)

export function createEmptyCriterionConfig() {
  return { targetLevel: null }
}

export function validateCriterionConfig(config) {
  if (!config || !VALID_LEVELS.includes(config.targetLevel)) {
    throw new Error('Το «Επίπεδο υποστήριξης» χρειάζεται έγκυρο επιθυμητό επίπεδο (ανεξάρτητα / λεκτική υπόδειξη / σωματική βοήθεια).')
  }
}

export function generateCriterionText(config) {
  return promptLevelLabel(config.targetLevel)
}

export function legacyCriterionText(goal) {
  return goal.criterion || ''
}

export function formatRecordedValue(measurementValue) {
  if (!measurementValue || !measurementValue.level) return '—'
  return promptLevelLabel(measurementValue.level)
}

// Technical Plan Στάδιο 2 — η μοναδική σκόπιμη αλλαγή παρουσίασης: αφαιρείται εντελώς το
// ψευδο-ποσοστό που παρήγαγε σήμερα το measurementValue.js (rank μετατρεπόταν σε ((rank-1)/2)*100
// ΑΝΕΞΑΡΤΗΤΑ από τον πραγματικό στόχο — μια μέτρηση "independent" έδειχνε πάντα 100%, ακόμα κι αν
// ο στόχος ήταν "verbal"). Ισχύει ΚΑΙ για legacy ΚΑΙ για νέα goals — καμία αναλογία, ποτέ.
export const supportsProgress = false
export const supportsNearCriterion = true

function rankOf(measurementValue) {
  if (!measurementValue || !PROMPT_LEVEL_RANK[measurementValue.level]) return null
  return PROMPT_LEVEL_RANK[measurementValue.level]
}

function resolveTargetRank(criterionConfig, criterionText) {
  if (criterionConfig) return PROMPT_LEVEL_RANK[criterionConfig.targetLevel] ?? null
  return parseCriterionTarget(criterionText, 'promptLevel') // ήδη επιστρέφει rank ή null
}

export function computeProgressPercent() {
  return notComputable()
}

export function meetsCriterion(measurementValue, { criterionConfig, criterionText } = {}) {
  const rank = rankOf(measurementValue)
  const targetRank = resolveTargetRank(criterionConfig, criterionText)
  if (rank === null || targetRank === null) return notComputable()
  return computed(rank >= targetRank)
}

// near = «μία βαθμίδα πριν τον στόχο» (Product Design §3) — π.χ. στόχος «Ανεξάρτητα», τρέχουσα
// μέτρηση «Λεκτική υπόδειξη» (rank 2 έναντι 3). ΠΟΤΕ όταν ήδη έχει επιτευχθεί ο στόχος.
export function isNearCriterion(measurementValue, { criterionConfig, criterionText } = {}) {
  const rank = rankOf(measurementValue)
  const targetRank = resolveTargetRank(criterionConfig, criterionText)
  if (rank === null || targetRank === null) return notComputable()
  if (rank >= targetRank) return computed(false)
  return computed(targetRank - rank === 1)
}

// near σημαίνει ΠΑΝΤΑ «ακριβώς 1 βαθμίδα υποστήριξης κάτω από τον στόχο» — σταθερό κείμενο.
export function describeNearCriterion() {
  return 'Απομένει 1 βαθμίδα υποστήριξης για επίτευξη'
}
