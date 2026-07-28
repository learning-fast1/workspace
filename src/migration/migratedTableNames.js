// Sprint 5A Phase 2, Commit 2 — η ΜΟΝΑΔΙΚΗ πηγή αλήθειας για ΠΟΙΟΙ 16 legacy πίνακες έχουν _v2
// αντίστοιχο και ΜΕ ΠΟΙΑ ΣΕΙΡΑ πρέπει να μεταφερθούν (εξαρτήσεις πρώτα). Το foreignKeyMap.test.js
// (Commit 1) χρησιμοποιούσε ως τότε δικό του, καρφωμένο KNOWN_TABLES — αντικαθίσταται εδώ, όπως
// ρητά προγραμματίστηκε τότε.
//
// Σειρά (ρητά καθορισμένη, ΟΧΙ αλφαβητική): πρώτα οι πίνακες χωρίς εξαρτήσεις που ΑΛΛΟΙ πίνακες
// χρειάζονται (students, schoolYears), μετά goals/domainTemplates/sessions/scheduleSlots, μετά ΟΛΟΙ
// οι πίνακες που εξαρτώνται από τα παραπάνω, και τέλος οι πλήρως ανεξάρτητοι (goalTemplates,
// calendarEvents — θα μπορούσαν να τρέξουν οποτεδήποτε, μπαίνουν στο τέλος για σαφήνεια).
// Το appMeta ΔΕΝ περιλαμβάνεται — μόνιμα τοπικό/ανά-συσκευή, ποτέ δεν αποκτά _v2 (βλ. db.js).
export const MIGRATED_TABLE_NAMES = [
  'students',
  'schoolYears',
  'goals',
  'domainTemplates',
  'sessions',
  'scheduleSlots',
  'measurements',
  'observations',
  'reports',
  'dailyQueue',
  'scheduleExceptions',
  'schoolYearParticipation',
  'goalEvents',
  'sessionGoalAssessments',
  'goalTemplates',
  'calendarEvents',
  // Smart Notifications (review χρήστη) — πλήρως ανεξάρτητος πίνακας, μπαίνει στο τέλος ίδια
  // λογική με goalTemplates/calendarEvents παραπάνω. ΜΟΝΑΔΙΚΗ εξαίρεση: το δικό του primary key
  // ΔΕΝ είναι αυτόματο (βλ. db.js) — deterministic string id, ΙΔΙΟ σε legacy ΚΑΙ _v2.
  'notificationState'
]

// domainTemplates είναι η ΜΟΝΑΔΙΚΗ εξαίρεση όπου το legacy primary key ΔΕΝ είναι `id` — είναι το
// ίδιο το `domain` (string). Το migration χρειάζεται να ξέρει αυτό ρητά, ώστε να υπολογίζει το
// deterministic id από τη ΣΩΣΤΗ παλιά τιμή (βλ. rowMapper.js) — ΟΧΙ από ένα ανύπαρκτο row.id.
export const LEGACY_PRIMARY_KEY_FIELD = {
  domainTemplates: 'domain'
}

export function legacyPrimaryKeyField(tableName) {
  return LEGACY_PRIMARY_KEY_FIELD[tableName] || 'id'
}

export function v2TableName(tableName) {
  return `${tableName}_v2`
}

// Επιβεβαιώνει ότι το ΠΡΑΓΜΑΤΙΚΟ schema του db.js (μέσω του ήδη υπάρχοντος DATA_TABLE_NAMES, που
// αντλείται ζωντανά από db.tables) δηλώνει ΚΑΘΕ πίνακα αυτής της λίστας ΚΑΙ το _v2 αντίστοιχό του.
// ΣΚΟΠΙΜΑ όχι αυτόματη κλήση σε αυτό το module (κανένα top-level side effect εδώ) — καλείται ΜΟΝΟ
// από το ίδιο το migration engine πριν ξεκινήσει (και από τα δικά της tests) ώστε μια αναντιστοιχία
// να μπλοκάρει ΡΗΤΑ το migration, όχι μια απλή τοπική εκκίνηση της εφαρμογής χωρίς cloud (Phase 2
// Technical Plan, το σημείο που ζητήθηκε ρητά κατά την έγκριση του Commit 1).
export function assertMigratedTablesComplete(actualTableNames) {
  const missing = []
  for (const table of MIGRATED_TABLE_NAMES) {
    if (!actualTableNames.includes(table)) missing.push(table)
    const v2 = v2TableName(table)
    if (!actualTableNames.includes(v2)) missing.push(v2)
  }
  if (missing.length > 0) {
    throw new Error(
      `migratedTableNames: το db.js schema δεν δηλώνει ${missing.length} αναμενόμενο(-α) πίνακα(-ες): ${missing.join(', ')}. ` +
      'Το migration ΔΕΝ μπορεί να ξεκινήσει με ελλιπές σχήμα.'
    )
  }
}
