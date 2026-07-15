import { SCHEDULE_COLOR_PALETTE } from '../config/scheduleColors.js'

// Χρωματική ταυτότητα μαθητή/ομάδας (Sprint 6) — ΚΑΜΙΑ αποθήκευση, καθαρά παραγόμενο από την
// ταυτότητα, ώστε να δουλεύει αναδρομικά για κάθε ήδη υπάρχοντα μαθητή χωρίς migration/backfill.
// Ιδιότητες που πρέπει να ικανοποιούνται (Technical Plan, εγκεκριμένο χωρίς δέσμευση σε
// συγκεκριμένο αλγόριθμο): (1) σταθερότητα — ίδια ταυτότητα → πάντα ίδιο χρώμα, ανεξάρτητα από
// αλλαγές αλλού (π.χ. αρχειοθέτηση άλλου μαθητή)· (2) οπτική διάκριση σε ρεαλιστικό caseload·
// (3) ποτέ η μόνη πηγή αναγνώρισης — πάντα συνοδεία κειμένου, εδώ δεν μας αφορά (γίνεται στο UI).
//
// Μεμονωμένος μαθητής: το student.id είναι ήδη ένας σταθερός, μονότονος, ποτέ-ξαναχρησιμοποιούμενος
// αριθμός (Dexie auto-increment) — το modulo πάνω σε διαδοχικούς ακέραιους διανέμει ήδη ομοιόμορφα
// στην παλέτα, χωρίς κανένα ρίσκο τυχαίας συσσώρευσης (σε αντίθεση με ένα hash function πάνω σε
// αυθαίρετο key). Η αρχειοθέτηση δεν αλλάζει το id κανενός άλλου μαθητή, άρα κανένα χρώμα δεν
// μετατοπίζεται ποτέ.
export function colorForStudent(studentId) {
  const index = ((studentId - 1) % SCHEDULE_COLOR_PALETTE.length + SCHEDULE_COLOR_PALETTE.length) % SCHEDULE_COLOR_PALETTE.length
  return SCHEDULE_COLOR_PALETTE[index]
}

// Ομάδα: καμία φυσική σειρά δημιουργίας υπάρχει για ένα σύνολο μαθητών (παράγωγη ταυτότητα) —
// hash πάνω στο ΤΑΞΙΝΟΜΗΜΕΝΟ σύνολο studentIds, ώστε η ΙΔΙΑ ομάδα μαθητών να παίρνει το ίδιο
// χρώμα ανεξάρτητα από το αν προέρχεται από πρότυπο, χειροκίνητη προσθήκη, ή διαφορετικό slot με
// τα ίδια μέλη. Μικρότερος κίνδυνος σύγκρουσης εδώ εκ φύσεως (πολύ λιγότερες ταυτόχρονα ενεργές
// ομάδες από μεμονωμένους μαθητές σε κάθε ρεαλιστικό caseload).
export function colorForGroup(studentIds) {
  const key = [...studentIds].sort((a, b) => a - b).join(',')
  let hash = 5381
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i)
  }
  const index = Math.abs(hash) % SCHEDULE_COLOR_PALETTE.length
  return SCHEDULE_COLOR_PALETTE[index]
}

// Βολικό σημείο εισόδου — δέχεται ένα studentIds[] (1 = μεμονωμένος, 2+ = ομάδα).
export function colorForIdentity(studentIds) {
  return studentIds.length === 1 ? colorForStudent(studentIds[0]) : colorForGroup(studentIds)
}
