// Sprint 5A Phase 2, Commit 2 — ρητή, στενή λίστα (table, field) ζευγών όπου ένα ΜΗ-null foreign
// key επιτρέπεται να δείχνει σε ανύπαρκτη _v2 γραμμή ΧΩΡΙΣ να μπλοκάρει την ολοκλήρωση του
// migration. ΚΑΘΕ καταχώρηση ΠΡΕΠΕΙ να έχει reason — τεκμηρίωση ΓΙΑΤΙ είναι ασφαλές, όχι απλώς
// «περνάει το test». Άδεια εξ ορισμού: μετά από έλεγχο ολόκληρου του υπάρχοντος schema/κώδικα
// (deleteStudent/deleteSession/endScheduleSlotSeries — βλ. db.js) ΔΕΝ βρέθηκε καμία ΓΝΩΣΤΗ,
// τεκμηριωμένη περίπτωση όπου ένα μη-null FK θα έπρεπε νόμιμα να «κρέμεται» — η εφαρμογή διατηρεί
// ήδη σκόπιμα αναφορική ακεραιότητα παντού (π.χ. deleteSession μηδενίζει το observations.sessionId
// αντί να το αφήνει να δείχνει σε διαγραμμένη συνεδρία). Αν ποτέ βρεθεί μια πραγματική, νόμιμη
// περίπτωση, προστίθεται ΕΔΩ, με πλήρη τεκμηρίωση — ΠΟΤΕ σιωπηλή χαλάρωση μέσα στο ίδιο το
// verifyMigration.
export const TOLERATED_ORPHAN_FOREIGN_KEYS = []

// Επιστρέφει την καταχώρηση της allowlist που ταιριάζει (table, field), ή null αν δεν υπάρχει.
export function findToleratedOrphanEntry(table, field, allowlist = TOLERATED_ORPHAN_FOREIGN_KEYS) {
  return allowlist.find((entry) => entry.table === table && entry.field === field) || null
}
