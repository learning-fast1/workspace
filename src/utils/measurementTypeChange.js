// Καθαρή λογική απόφασης για την αλλαγή measurementType στο Goal Wizard (Technical Plan Στάδιο 3)
// — ξεχωρισμένη από το component ώστε να τεσταριστεί χωρίς rendering. Δεν αγγίζει τη βάση, δεν
// μεταλλάσσει τίποτα, καμία εξάρτηση από React — απλά αποφασίζει «τι θα έπρεπε να συμβεί»
// δεδομένης της τρέχουσας κατάστασης του goal.
import { getMeasurementType } from './measurementTypes/index.js'

function isNonEmptyLeaf(v) {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.values(v).some(isNonEmptyLeaf)
  return Boolean(v)
}

// Αν υπάρχει ήδη κάτι «χαμένο» στο criterion/criterionConfig του ΤΡΕΧΟΝΤΟΣ τύπου — ελέγχει και τα
// δύο πεδία (όχι μόνο criterion) ώστε να παραμείνει σωστό και μετά το Στάδιο 4, όταν το criterionConfig
// θα γεμίζει από πραγματικά dynamic panels αντί για το σημερινό ελεύθερο κείμενο.
export function hasCriterionContent(goal) {
  return Boolean(goal.criterion?.trim()) || isNonEmptyLeaf(goal.criterionConfig)
}

// Αποφασίζει τι θα έπρεπε να συμβεί όταν ο εκπαιδευτικός επιλέγει `nextType`:
//   'noop'    — ξαναπάτησε τον ήδη επιλεγμένο τύπο, καμία ενέργεια.
//   'blocked' — ο στόχος έχει ήδη μετρήσεις, η αλλαγή τύπου απαγορεύεται εδώ.
//   'confirm' — υπάρχει ήδη περιεχόμενο που θα χανόταν, χρειάζεται ρητή επιβεβαίωση.
//   'apply'   — τίποτα να χαθεί (πρώτη επιλογή, ή άδειο μέχρι τώρα), εφαρμόζεται αμέσως.
export function decideMeasurementTypeChange(goal, nextType, hasMeasurements) {
  if (goal.measurementType === nextType) return 'noop'
  if (hasMeasurements) return 'blocked'
  if (hasCriterionContent(goal)) return 'confirm'
  return 'apply'
}

// Το goal patch μετά από επιβεβαιωμένη (ή απευθείας, 'apply') αλλαγή τύπου — ΠΑΝΤΑ μέσω
// createEmptyCriterionConfig() του ΝΕΟΥ module (απόφαση χρήστη, Στάδιο 3 σημείο 5), ποτέ
// χειροκίνητο {} ή διατήρηση παλιών πεδίων του προηγούμενου τύπου.
export function applyMeasurementTypeChange(nextType) {
  return {
    measurementType: nextType,
    criterion: '',
    criterionConfig: getMeasurementType(nextType).createEmptyCriterionConfig()
  }
}
