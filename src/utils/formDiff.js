// Critical fix (Technical Fix Plan, entity-ID/partial-update follow-up) — κεντρικός helper που
// υπολογίζει ΜΟΝΟ τα πραγματικά αλλαγμένα πεδία ανάμεσα σε ένα αρχικό snapshot και το τελικό,
// ήδη-normalized payload που πρόκειται να αποθηκευτεί. Αντικαθιστά το idiom «στείλε ολόκληρο το
// form στο .update()» (StudentForm.jsx/GoalWizardForm.jsx/CalendarEventForm.jsx/SessionModal.jsx/
// GoalLibraryPicker.jsx) — εκείνο ακύρωνε πρακτικά το property-level merge που ήδη παρέχει το
// Dexie Cloud για Table.update() (βλ. Root Cause Investigation, Scenario E): δύο συσκευές που
// αλλάζουν διαφορετικά πεδία της ΙΔΙΑΣ εγγραφής offline έχαναν σιωπηλά τη μία αλλαγή, επειδή κάθε
// .update() δήλωνε (λανθασμένα) ότι άλλαξαν ΟΛΑ τα πεδία, όχι μόνο αυτό που πραγματικά άλλαξε ο
// χρήστης.
//
// Σκόπιμα ΔΕΝ αγγίζει κανένα από τα δύο ορίσματα — καθαρή, read-only σύγκριση.

function valuesEqual(a, b) {
  if (a === b) return true
  // JSON.stringify idiom — ΙΔΙΟ με το ήδη υπάρχον isDirty() (StudentForm.jsx/GoalWizardForm.jsx)
  // — top-level-property granularity, ίδια με αυτή που περιγράφει η τεκμηρίωση του Dexie Cloud
  // για merge σε nested objects/arrays (μία ενιαία τιμή ανά property, όχι per-element merge).
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

// original: το snapshot όπως φορτώθηκε αρχικά (π.χ. initialFormRef.current).
// updated: το ΤΕΛΙΚΟ, ήδη-normalized payload προς αποθήκευση (π.χ. trimmed code) — ΟΧΙ το ωμό
// form state, αλλιώς ένα καθαρά κοσμητικό leading/trailing space θα καταγραφόταν ως ψευδής αλλαγή.
//
// Επιστρέφει ΜΟΝΟ keys που: (α) υπάρχουν ρητά στο updated, (β) η τιμή τους δεν είναι undefined,
// (γ) η τιμή τους πραγματικά διαφέρει από το original. Άδειο αποτέλεσμα === καμία πραγματική αλλαγή.
export function diffFields(original, updated) {
  const diff = {}
  for (const key of Object.keys(updated)) {
    const newValue = updated[key]
    if (newValue === undefined) continue
    const oldValue = original ? original[key] : undefined
    if (!valuesEqual(oldValue, newValue)) {
      diff[key] = newValue
    }
  }
  return diff
}
