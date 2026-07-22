// Επιλογές προτεραιότητας και κατάστασης για τους στόχους (Goal).
export const PRIORITIES = [
  { value: 'high', label: 'Υψηλή' },
  { value: 'medium', label: 'Μεσαία' },
  { value: 'low', label: 'Χαμηλή' }
]

export const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

// Sprint 7 (Technical Plan Στάδιο 3): το 'revised' έπαψε να είναι κατάσταση στόχου — έγινε τύπος
// goalEvent (βλ. db.js, migrateRevisedGoalStatusCore). Στη θέση του, 'paused' — στόχος προσωρινά
// ανασταλμένος, δεν μετριέται στο Teaching Mode όσο βρίσκεται εδώ (Product Design §3). Αυτός ο
// πίνακας χρησιμοποιείται ΜΟΝΟ για ετικέτες/χρώματα — ποιες μεταβάσεις επιτρέπονται ορίζεται
// αποκλειστικά στο db.js (GOAL_STATUS_TRANSITIONS / getAllowedGoalStatusTransitions), όχι εδώ.
export const STATUSES = [
  { value: 'active', label: 'Ενεργός' },
  { value: 'paused', label: 'Παύση' },
  { value: 'achieved', label: 'Επιτεύχθηκε' },
  { value: 'archived', label: 'Αρχειοθετημένος' }
]

// Κοινή αντιστοίχιση σε Badge variant — μία πηγή αλήθειας για GoalCard/GoalDetail (και όπου
// αλλού χρειαστεί), ώστε το ίδιο priority/status να μη ζωγραφίζεται διαφορετικά σε δύο οθόνες.
export const PRIORITY_BADGE_VARIANT = { high: 'danger', medium: 'warning', low: 'neutral' }
export const STATUS_BADGE_VARIANT = { active: 'primary', paused: 'warning', achieved: 'success', archived: 'neutral' }

export function priorityLabel(value) {
  return PRIORITIES.find((p) => p.value === value)?.label || value
}

// Ταξινομεί στόχους με τους high priority πρώτους — ίδια σειρά παντού που εμφανίζονται στόχοι.
export function sortByPriority(goals) {
  return [...goals].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
}

export function statusLabel(value) {
  return STATUSES.find((s) => s.value === value)?.label || value
}
