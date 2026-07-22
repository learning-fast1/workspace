// Registry των 8 τύπων μέτρησης — Technical Plan Στάδιο 1. Κάθε τύπος είναι αυτόνομη μονάδα
// (capability-based αρχιτεκτονική, βλ. Product Design §2): ΔΕΝ υπάρχει κεντρικό switch με τη
// λογική validate/generate ανά τύπο διάσπαρτη αλλού — ο καλών «ρωτάει τον τύπο», δεν αποφασίζει
// ο ίδιος. Το Στάδιο 2 θα προσθέσει στα ΙΔΙΑ modules τις ικανότητες προόδου/near-criterion
// (supportsProgress/computeProgressPercent/supportsNearCriterion/isNearCriterion) — δεν είναι
// ξεχωριστά αρχεία, ώστε να μην χρειαστεί μελλοντικό refactor/μετακίνηση.
import * as successRatio from './successRatio.js'
import * as taskAnalysis from './taskAnalysis.js'
import * as promptLevel from './promptLevel.js'
import * as ratingScale from './ratingScale.js'
import * as checklist from './checklist.js'
import * as duration from './duration.js'
import * as frequency from './frequency.js'
import * as narrative from './narrative.js'

const REGISTRY = { successRatio, taskAnalysis, promptLevel, ratingScale, checklist, duration, frequency, narrative }

export function getMeasurementType(type) {
  const module = REGISTRY[type]
  if (!module) {
    throw new Error(`Άγνωστος τύπος μέτρησης: «${type}»`)
  }
  return module
}

// Σειρά εμφάνισης στις κάρτες της Οθόνης Α (Product Design §4) — 3 υπάρχοντες πρώτα, μετά οι 5 νέοι.
export function listMeasurementTypes() {
  return [successRatio, taskAnalysis, promptLevel, checklist, ratingScale, duration, frequency, narrative]
}

// Επικυρώνει το criterionConfig ΓΙΑ ΤΟΝ ΣΥΓΚΕΚΡΙΜΕΝΟ measurementType — ένα criterionConfig με το
// σχήμα άλλου τύπου (π.χ. duration-shaped πάνω σε ratingScale) αποτυγχάνει φυσικά εδώ, αφού λείπουν
// τα πεδία που περιμένει ο σωστός validator (καμία ξεχωριστή «ταίριασμα σχήματος» απαιτείται).
export function validateCriterionConfig(measurementType, criterionConfig) {
  getMeasurementType(measurementType).validateCriterionConfig(criterionConfig)
}

// Παράγει το ανθρώπινο κείμενο κριτηρίου ΑΠΟ ΤΟ criterionConfig — καλείται ΜΟΝΟ όταν το
// criterionConfig είναι το ίδιο ήδη έγκυρο (ο καλών πρέπει να έχει τρέξει validateCriterionConfig
// πρώτα, βλ. db.js createGoalCore/updateGoalCriterion). Legacy goals χωρίς criterionConfig ΔΕΝ
// περνάνε ποτέ από εδώ — το goal.criterion τους παραμένει το ήδη υπάρχον ελεύθερο κείμενο, αμετάβλητο.
export function generateCriterionText(measurementType, criterionConfig) {
  return getMeasurementType(measurementType).generateCriterionText(criterionConfig)
}

// Technical Plan Στάδιο 2 — τα τρία capability functions, ΙΔΙΑ σύμβαση αποτελέσματος παντού
// ({ computable, value }, βλ. _shared.js). context = { criterionConfig, criterionText } — ΠΟΤΕ
// ολόκληρο το goal (εγκεκριμένη διόρθωση χρήστη: κάθε module διαβάζει αποκλειστικά αυτά τα δύο
// πεδία, ποτέ άσχετα goal fields). criterionConfig λείπει για legacy goals — το module αποφασίζει
// μόνο του αν/πώς θα χρησιμοποιήσει το criterionText ως fallback.
export function computeProgressPercent(measurementType, value, context = {}) {
  return getMeasurementType(measurementType).computeProgressPercent(value, context)
}

export function isNearCriterion(measurementType, value, context = {}) {
  return getMeasurementType(measurementType).isNearCriterion(value, context)
}

// Ανθρώπινη, ΤΥΠΟ-ΕΙΔΙΚΗ περιγραφή του «γιατί είναι κοντά» (Sprint 7 feedback χρήστη — widget
// «Χρειάζονται προσοχή»: μια γενική ετικέτα «Κοντά στο κριτήριο» δεν εξηγεί τίποτα άμεσα
// κατανοητό). Καλείται ΜΟΝΟ αφού το isNearCriterion έχει ήδη επιστρέψει computable:true/value:true
// (goalAttention.js) — προαιρετική ικανότητα, ίδιο idiom με το isEmptyRecordedValue, αφού μόνο οι
// τύποι με supportsNearCriterion την ορίζουν (narrative δεν την έχει καν ανάγκη).
export function describeNearCriterion(measurementType, value, context = {}) {
  const module = getMeasurementType(measurementType)
  return module.describeNearCriterion ? module.describeNearCriterion(value, context) : null
}

export function meetsCriterion(measurementType, value, context = {}) {
  return getMeasurementType(measurementType).meetsCriterion(value, context)
}

// Technical Plan Στάδιο 8 — «αυτή η καταγραφή είναι ουσιαστικά κενή, δεν πρέπει να αποθηκευτεί ως
// measurement» (π.χ. άθικτο textarea στην Περιγραφική παρατήρηση). Προαιρετική ικανότητα ανά
// module (ίδιο idiom με supportsProgress/supportsNearCriterion) — μόνο η narrative την ορίζει προς
// το παρόν· οποιοσδήποτε άλλος τύπος θεωρείται ΠΟΤΕ κενός από προεπιλογή (π.χ. ένας μετρητής στο 0
// ΕΙΝΑΙ πραγματική καταγραφή, όχι απουσία μέτρησης).
export function isEmptyRecordedValue(measurementType, value) {
  const module = getMeasurementType(measurementType)
  return module.isEmptyRecordedValue ? module.isEmptyRecordedValue(value) : false
}

// Technical Plan Στάδιο 9α — ανθρώπινο κείμενο μιας ΗΔΗ καταγεγραμμένης τιμής (π.χ. «Επίπεδο 3 —
// «...»», «15 λεπτά», «Λεκτική υπόδειξη»). ΔΕΝ ήταν re-exported μέχρι τώρα εδώ (μόνο μέσω
// getMeasurementType(type).formatRecordedValue απευθείας) — το GoalsList.jsx το χρειάζεται πλέον
// για την «Τελευταία καταγραφή» ετικέτα των μη-computable τύπων.
export function formatRecordedValue(measurementType, value, criterionConfig) {
  return getMeasurementType(measurementType).formatRecordedValue(value, criterionConfig)
}
