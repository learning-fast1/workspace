import { generateCriterionText, validateCriterionConfig } from '../utils/measurementTypes/index.js'

// Ζωντανή προεπισκόπηση κειμένου κριτηρίου (Στάδιο 5, επαναχρησιμοποιείται στο Στάδιο 6) —
// εμφανίζεται ΜΟΝΟ όταν το ίδιο το validateCriterionConfig του αντίστοιχου framework-agnostic
// module θα δεχόταν το config. Κανένα panel δεν αναπαράγει δικό του κανόνα εγκυρότητας μόνο για
// την προεπισκόπηση — DRY, μία μόνο πηγή αλήθειας.
export function computeCriterionPreview(measurementType, config) {
  try {
    validateCriterionConfig(measurementType, config)
  } catch {
    return null
  }
  return generateCriterionText(measurementType, config)
}
