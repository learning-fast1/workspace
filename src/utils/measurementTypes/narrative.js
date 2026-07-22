// Περιγραφική παρατήρηση — Technical Plan Στάδιο 1. criterionConfig: { successDescription }.
// Καμία αυτόματη ανίχνευση ολοκλήρωσης (απόφαση χρήστη ④) — καμία πρόοδος, κανένα near-criterion,
// η απόφαση παραμένει πάντα χειροκίνητη μέσω του υπάρχοντος GoalStatusModal. Καμία legacy — brand new τύπος.
import { notComputable } from './_shared.js'

export const value = 'narrative'
export const label = 'Περιγραφική παρατήρηση'
export const icon = '📝'
export const kind = 'qualitative'

export function createEmptyCriterionConfig() {
  return { successDescription: '' }
}

export function validateCriterionConfig(config) {
  if (!config || !config.successDescription || !config.successDescription.trim()) {
    throw new Error('Η «Περιγραφική παρατήρηση» χρειάζεται περιγραφή του τι σημαίνει επιτυχία.')
  }
}

export function generateCriterionText(config) {
  return config.successDescription.trim()
}

// Ποτέ δεν καλείται στην πράξη — καμία υπάρχουσα βάση δεν έχει goals αυτού του τύπου (νέος τύπος).
export function legacyCriterionText(goal) {
  return goal.criterion || ''
}

export function formatRecordedValue(measurementValue) {
  return measurementValue?.note?.trim() || '—'
}

// Technical Plan Στάδιο 8 — ένα κενό textarea στο Teaching Mode ΔΕΝ σημαίνει «κατέγραψε μηδενική
// τιμή» (σε αντίθεση με π.χ. ένα μετρητή στο 0, που ΕΙΝΑΙ μια πραγματική καταγραφή) — σημαίνει
// «δεν καταγράφηκε καθόλου μέτρηση για αυτόν τον στόχο σε αυτή τη συνεδρία». Το
// TeachingMode.jsx καλεί αυτό πριν την αποθήκευση για να αποφύγει κενές εγγραφές measurements.
export function isEmptyRecordedValue(measurementValue) {
  return !measurementValue?.note || !measurementValue.note.trim()
}

export const supportsProgress = false
export const supportsNearCriterion = false

export function computeProgressPercent() {
  return notComputable()
}

export function isNearCriterion() {
  return notComputable()
}

// ④ ρητή απόφαση χρήστη — ποτέ αυτόματη ανίχνευση ολοκλήρωσης, η κρίση του εκπαιδευτικού ΕΙΝΑΙ η μέτρηση.
export function meetsCriterion() {
  return notComputable()
}
