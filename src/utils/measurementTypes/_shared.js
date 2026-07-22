// Κοινή σύμβαση αποτελεσμάτων (Technical Plan Στάδιο 2, σημείο 2 — εγκεκριμένο) — ΙΔΙΟ shape σε
// ΚΑΘΕ computeProgressPercent/isNearCriterion/meetsCriterion, σε όλα τα 8 modules, χωρίς εξαίρεση:
//   { computable: boolean, value: T | null }
// «computable» (ανά ΚΛΗΣΗ) ≠ «supportsProgress/supportsNearCriterion» (στατικό, ανά ΤΥΠΟ). Το
// δεύτερο λέει «αυτός ο τύπος έχει ΚΑΝ αυτή την έννοια»· το πρώτο λέει «για ΑΥΤΟ το goal/μέτρηση,
// υπήρχε αρκετή/αξιόπιστη πληροφορία ΤΩΡΑ» — false όταν λείπει μέτρηση, όταν το legacy ελεύθερο
// κείμενο δεν parse-άρεται με ασφάλεια, ή όταν ο τύπος δεν υποστηρίζει καθόλου την έννοια.
export function notComputable() {
  return { computable: false, value: null }
}

export function computed(value) {
  return { computable: true, value }
}

// Κοινή αναλογική λογική «προς το criterion» — χρησιμοποιείται ΑΠΟ taskAnalysis.js ΚΑΙ checklist.js
// (ίδιος ακριβώς υπολογισμός και για τα δύο: πόσα ολοκληρώθηκαν έναντι πόσα χρειάζονται). Progress
// υπολογίζεται ΠΡΟΣ το targetCompletedCount (όχι προς το σύνολο της λίστας) — διόρθωση χρήστη
// Σταδίου 2, σημείο 4: αν το criterion είναι «5 από 6», η μπάρα φτάνει 100% στα 5, όχι στα 6.
// near = λείπει ΑΚΡΙΒΩΣ 1 μονάδα και δεν έχει ήδη επιτευχθεί ο στόχος.
export function ratioProgressPercent(completed, target) {
  if (!Number.isFinite(completed) || !Number.isFinite(target) || target <= 0) return null
  return Math.min(100, Math.round((completed / target) * 100))
}

export function ratioMeets(completed, target) {
  if (!Number.isFinite(completed) || !Number.isFinite(target)) return null
  return completed >= target
}

export function ratioIsNear(completed, target) {
  const meets = ratioMeets(completed, target)
  if (meets === null) return null
  if (meets) return false
  return target - completed === 1
}
