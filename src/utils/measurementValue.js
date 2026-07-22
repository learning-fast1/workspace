import { PROMPT_LEVEL_RANK, promptLevelLabel } from '../config/promptLevels.js'

// Μετατρέπει την τιμή μιας μέτρησης (σχήμα ανάλογα με το measurementType) σε έναν αριθμό για το γράφημα.
export function measurementNumericValue(measurementType, value) {
  if (!value) return null
  switch (measurementType) {
    case 'successRatio':
      return value.attempts ? Math.round((value.successes / value.attempts) * 100) : null
    case 'promptLevel':
      return PROMPT_LEVEL_RANK[value.level] ?? null
    case 'duration':
      return value.minutes ?? null
    case 'taskAnalysis':
      return value.stepsCompleted ?? null
    default:
      return null
  }
}

// Ανθρώπινα αναγνώσιμη διατύπωση μιας τιμής μέτρησης, για χρήση σε προσχέδια εκθέσεων.
export function formatMeasurementValue(measurementType, value) {
  if (!value) return '—'
  switch (measurementType) {
    case 'successRatio':
      return value.attempts ? `${value.successes}/${value.attempts} (${Math.round((value.successes / value.attempts) * 100)}%)` : '—'
    case 'promptLevel':
      return promptLevelLabel(value.level)
    case 'duration':
      return value.minutes != null ? `${value.minutes} λεπτά` : '—'
    case 'taskAnalysis':
      return value.stepsCompleted != null ? `${value.stepsCompleted} βήματα` : '—'
    default:
      return '—'
  }
}

export function measurementUnitLabel(measurementType) {
  switch (measurementType) {
    case 'successRatio': return '%'
    case 'promptLevel': return 'επίπεδο'
    case 'duration': return 'λεπτά'
    case 'taskAnalysis': return 'βήματα'
    default: return ''
  }
}

// Προσπαθεί να εξάγει έναν αριθμητικό στόχο από το ελεύθερο κείμενο του κριτηρίου,
// ώστε να σχεδιαστεί η «γραμμή κριτηρίου» στο γράφημα. Επιστρέφει null αν δεν αναγνωρίζεται μοτίβο.
export function parseCriterionTarget(criterion, measurementType) {
  if (!criterion) return null
  const text = criterion.toLowerCase()

  if (measurementType === 'successRatio') {
    const ratio = text.match(/(\d+)\s*(?:από|στα|στις|\/)\s*(\d+)/)
    if (ratio) return Math.round((Number(ratio[1]) / Number(ratio[2])) * 100)
    const pct = text.match(/(\d+)\s*%/)
    if (pct) return Number(pct[1])
    return null
  }

  if (measurementType === 'duration') {
    // Επιτρέπει λέξεις ανάμεσα στον αριθμό και το «λεπτά» (π.χ. «10 συνεχόμενα λεπτά»),
    // όχι μόνο άμεση γειτνίαση — αλλιώς συνηθισμένες διατυπώσεις κριτηρίων δεν αναγνωρίζονται.
    const m = text.match(/(\d+)\D{0,20}λεπτ/)
    return m ? Number(m[1]) : null
  }

  if (measurementType === 'taskAnalysis') {
    const m = text.match(/(\d+)\D{0,20}β(?:ή|η)μα/)
    return m ? Number(m[1]) : null
  }

  if (measurementType === 'promptLevel') {
    return text.includes('ανεξάρτητ') ? PROMPT_LEVEL_RANK.independent : null
  }

  return null
}

// Βρίσκει τη ΠΙΟ ΠΡΟΣΦΑΤΗ μέτρηση, δεδομένων ΗΔΗ date-joined μετρήσεων (κάθε στοιχείο πρέπει να
// έχει ήδη πεδίο `date` — π.χ. μέσω sessionDateMap join, βλ. GoalsList.jsx/utils/goalAttention.js).
// Καθαρή: filter/reduce δημιουργούν νέα δεδομένα, ΔΕΝ μεταλλάσσουν το input array (κανένα in-place
// sort). Επιστρέφει null αν καμία μέτρηση δεν έχει date.
export function latestDatedMeasurement(datedMeasurements) {
  const withDate = datedMeasurements.filter((m) => m.date)
  if (withDate.length === 0) return null
  return withDate.reduce((latest, m) => (!latest || m.date > latest.date ? m : latest), null)
}

// ΣΗΜΕΙΩΣΗ (Technical Plan Στάδιο 9α): το παλιό computeProgressPercent(measurementType,
// latestValue, criterionTarget) που ζούσε εδώ αφαιρέθηκε — repo-wide έλεγχος (grep) επιβεβαίωσε
// ότι ο ΜΟΝΑΔΙΚΟΣ caller του ήταν το GoalsList.jsx, το οποίο πλέον καλεί αποκλειστικά το
// utils/measurementTypes/index.js (registry) — η ίδια η κλήση αντικαταστάθηκε σε αυτό το στάδιο.
// Αν χρειαστεί ποτέ ξανά ένα «legacy» computeProgressPercent, βλ. git history αυτού του αρχείου.
