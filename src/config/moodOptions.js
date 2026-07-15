import { Angry, Frown, Laugh, Meh, Smile } from 'lucide-react'

// Διάθεση μαθητή κατά τη συνεδρία — προαιρετική καταγραφή, ίδιο βάρος/θέση με τη διάρκεια στο
// modal ολοκλήρωσης (Sprint 5 Product Design). Σκόπιμα ΟΥΔΕΤΕΡΗ ως προς τη χρονική στιγμή που
// αντιπροσωπεύει (αρχή/τέλος/γενικά της συνεδρίας) — δεν το κλειδώνουμε ακόμα, θα το δούμε στην
// πράξη. Lucide εικονίδια αντί για emoji (DESIGN_SYSTEM.md/COMPONENT_GUIDE.md: όχι emoji ως UI
// icons) — ήδη υπάρχουσες εκφράσεις προσώπου στο Lucide, ίδια πρόθεση με τα emoji χωρίς να σπάει
// τη συνέπεια rendering της εφαρμογής.
//
// Σειρά = διαβάθμιση διάθεσης (πολύ θετική → ουδέτερη → πολύ αρνητική), για γρήγορη οπτική σάρωση.
// Το «Ουδέτερος» είναι διακριτό από το «Ήρεμος/συνεργάσιμος» — το δεύτερο περιγράφει θετική,
// συνεργάσιμη κατάσταση, ενώ το πρώτο καλύπτει μια πραγματικά αδιάφορη/χωρίς έντονη αντίδραση
// στιγμή, χωρίς να «σπρώχνεται» τεχνητά προς καμία από τις δύο πλευρές.
//
// Μοναδική πηγή αλήθειας: value/label/icon/variant ορίζονται ΕΔΩ, όχι hardcoded σε κάθε component
// που τα χρησιμοποιεί (MoodPicker, TodayQueueItem, SessionModal, TeachingMode, utils/attentionSignal.js).
export const MOOD_OPTIONS = [
  { value: 'great', label: 'Πολύ ευδιάθετος', icon: Laugh, variant: 'success' },
  { value: 'calm', label: 'Ήρεμος / συνεργάσιμος', icon: Smile, variant: 'primary' },
  { value: 'neutral', label: 'Ουδέτερος', icon: Meh, variant: 'neutral' },
  { value: 'sad', label: 'Δυσφορία / λυπημένος', icon: Frown, variant: 'warning' },
  { value: 'angry', label: 'Θυμωμένος / αρνητική διάθεση', icon: Angry, variant: 'danger' }
]

// Χρησιμοποιείται από το utils/attentionSignal.js για τον εντοπισμό μοτίβου δύσκολης διάθεσης.
export const NEGATIVE_MOODS = ['sad', 'angry']

export function moodOption(value) {
  return MOOD_OPTIONS.find((m) => m.value === value) || null
}

export function moodLabel(value) {
  return moodOption(value)?.label || value
}
