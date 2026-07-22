// Οι 4 βαθμίδες κλινικής εκτίμησης στόχου ανά συνεδρία (Teaching Mode) — μοναδική πηγή αλήθειας
// για τις ετικέτες, ώστε το GoalClinicalAssessment.jsx (καταγραφή) και το SessionModal.jsx/
// utils/goalHistory.js (προβολή ιστορικού) να μη διαφωνούν ποτέ στη διατύπωση.
export const CLINICAL_RATINGS = [
  { value: 'worsened', label: 'Χειροτέρεψε' },
  { value: 'stable', label: 'Σταθερός' },
  { value: 'improved', label: 'Βελτιώθηκε' },
  { value: 'mastered', label: 'Κατακτήθηκε' }
]

export function clinicalRatingLabel(value) {
  return CLINICAL_RATINGS.find((r) => r.value === value)?.label || value
}
