import { db, CLOUD_ENABLED } from '../db.js'

// Sprint 5A Phase 2, Commit 2 — τα legacy (pre-cloud) tables ΔΕΝ έχουν ΚΑΝΕΝΑ πεδίο owner/userId
// (προϋπήρχαν του Phase 1 auth). Το runMigration() ΔΕΝ μπορεί λοιπόν να υποθέσει ότι όλες οι legacy
// γραμμές ανήκουν σε όποιον τυχαίνει να είναι συνδεδεμένος ΤΗ ΣΤΙΓΜΗ που καλείται — μια συσκευή που
// ξαναχρησιμοποιείται από άλλον λογαριασμό θα παρήγαγε _v2 δεδομένα με ΛΑΘΟΣ ιδιοκτήτη (πραγματική
// παραβίαση strict per-user isolation, όχι απλώς θεωρητικός κίνδυνος — βλ. review).
//
// Η λύση: ΜΙΑ ρητή, μόνιμη «διεκδίκηση» (claim) αποθηκευμένη στο appMeta, ΞΕΧΩΡΙΣΤΗ από το ίδιο το
// migration state — δηλώνει ΠΟΙΟΣ λογαριασμός «κατέχει» τα τοπικά legacy δεδομένα αυτής της
// συσκευής. ΠΟΤΕ δεν δημιουργείται σιωπηλά μέσα στο runMigration() — απαιτεί ΞΕΧΩΡΙΣΤΗ, ρητή κλήση
// (claimLegacyDataOwnership), ώστε μια μελλοντική οθόνη επιβεβαίωσης (Commit 3, εκτός scope εδώ) να
// είναι η ΜΟΝΑΔΙΚΗ πηγή αυτής της ενέργειας — ΠΟΤΕ αυτόματη πλευρική ενέργεια ενός migration call.
const OWNER_KEY = 'legacyDataOwner'

function defaultGetAuthenticatedUserId() {
  if (!CLOUD_ENABLED) {
    throw new Error('Η διεκδίκηση ιδιοκτησίας απαιτεί ενεργό cloud sync (CLOUD_ENABLED).')
  }
  const currentUser = db.cloud?.currentUser?.value
  if (!currentUser?.isLoggedIn || !currentUser?.userId) {
    throw new Error('Η διεκδίκηση ιδιοκτησίας απαιτεί συνδεδεμένο χρήστη.')
  }
  return currentUser.userId
}

// null = ΚΑΝΕΝΑΣ λογαριασμός δεν έχει διεκδικήσει ακόμα τα τοπικά legacy δεδομένα αυτής της
// συσκευής — είτε πρόκειται για ολωσδιόλου νέα εγκατάσταση, είτε (πιο σημαντικό) για μια ΗΔΗ
// υπάρχουσα, pre-Phase-2 εγκατάσταση με πραγματικά εκπαιδευτικά δεδομένα που απλά δεν έχουν ακόμα
// περάσει από αυτό το ρητό βήμα.
export async function getLegacyDataOwner() {
  const row = await db.appMeta.get(OWNER_KEY)
  return row?.value || null
}

// Η ΜΟΝΑΔΙΚΗ ρητή πράξη που συνδέει τα τοπικά legacy δεδομένα με έναν λογαριασμό. Idempotent για
// τον ΙΔΙΟ χρήστη (no-op αν έχει ήδη διεκδικηθεί από αυτόν) — ΠΕΤΑΕΙ αν έχει ήδη διεκδικηθεί από
// ΔΙΑΦΟΡΕΤΙΚΟ χρήστη (ΠΟΤΕ σιωπηλή επανεγγραφή/υπερίσχυση μιας ήδη υπάρχουσας διεκδίκησης — αυτό θα
// ήταν ακριβώς το σενάριο που προσπαθούμε να αποτρέψουμε).
export async function claimLegacyDataOwnership(userId, { getAuthenticatedUserId = defaultGetAuthenticatedUserId } = {}) {
  const authenticatedUserId = getAuthenticatedUserId()
  if (userId !== authenticatedUserId) {
    throw new Error('Το userId της διεκδίκησης πρέπει να ταιριάζει με τον τρέχοντα συνδεδεμένο χρήστη.')
  }

  const existing = await getLegacyDataOwner()
  if (existing) {
    if (existing.userId === userId) return existing
    throw new Error(
      'Τα τοπικά δεδομένα αυτής της συσκευής ανήκουν ήδη σε άλλο λογαριασμό. ' +
      'Δεν μπορούν να διεκδικηθούν εκ νέου από διαφορετικό χρήστη — η αλλαγή ιδιοκτήτη απαιτεί ξεχωριστή, ' +
      'μελλοντική λειτουργία επαναφοράς συσκευής (εκτός scope αυτού του commit).'
    )
  }

  const owner = { userId, claimedAt: new Date().toISOString() }
  await db.appMeta.put({ key: OWNER_KEY, value: owner })
  return owner
}

// Πετάει ΕΚΤΟΣ αν τα τοπικά legacy δεδομένα ανήκουν ΗΔΗ, ρητά, στον δοσμένο χρήστη. Καλείται από το
// runMigration() ΠΡΙΝ αγγιχτεί οποιαδήποτε γραμμή — η ΠΡΩΤΗ γραμμή άμυνας ενάντια σε λάθος
// attribution. Δύο ξεχωριστά, σαφή μηνύματα (κανένας ιδιοκτήτης / διαφορετικός ιδιοκτήτης) ώστε μια
// μελλοντική οθόνη UI (Commit 3) να μπορεί να δείξει το ΣΩΣΤΟ μήνυμα χωρίς να χρειάζεται να
// ξαναδιαβάσει η ίδια το appMeta.
export async function assertLegacyDataOwnership(userId) {
  const owner = await getLegacyDataOwner()
  if (!owner) {
    const err = new Error(
      'Τα τοπικά δεδομένα αυτής της συσκευής δεν έχουν διεκδικηθεί ακόμα από κανέναν λογαριασμό — ' +
      'απαιτείται ρητή επιβεβαίωση ιδιοκτησίας πριν το migration (βλ. claimLegacyDataOwnership).'
    )
    err.code = 'LEGACY_OWNER_UNCLAIMED'
    throw err
  }
  if (owner.userId !== userId) {
    const err = new Error(
      'Τα τοπικά δεδομένα αυτής της συσκευής ανήκουν σε διαφορετικό λογαριασμό — ' +
      'το migration αρνείται να τα ξαναγράψει στο όνομα του τρέχοντος συνδεδεμένου χρήστη.'
    )
    err.code = 'LEGACY_OWNER_MISMATCH'
    throw err
  }
  return owner
}

// ΣΚΟΠΙΜΑ ΔΕΝ υπάρχει καμία δημόσια «clearLegacyDataOwnership» σε αυτό το commit. Το να αφαιρεθεί
// ΜΟΝΟ η διεκδίκηση, αφήνοντας άθικτα τα ίδια τα legacy/_v2 εκπαιδευτικά δεδομένα, θα ξανάνοιγε
// ΑΚΡΙΒΩΣ τον κίνδυνο λανθασμένης απόδοσης που αυτό το module υπάρχει για να κλείσει — ένας
// δεύτερος χρήστης θα μπορούσε να διεκδικήσει εκ νέου ΚΑΙ να τρέξει migration πάνω σε δεδομένα που
// δεν είναι δικά του (Group review, Blocker 1 follow-up). Η ΜΟΝΑΔΙΚΗ νόμιμη περίπτωση αλλαγής
// ιδιοκτήτη (η συσκευή πράγματι αλλάζει χέρια) απαιτεί μια ΞΕΧΩΡΙΣΤΗ, μελλοντική, δικής της
// αξιολόγησης λειτουργία «επαναφοράς συσκευής» — που θα πρέπει να χειρίζεται ΚΑΙ τη διεκδίκηση ΚΑΙ
// τα ίδια τα δεδομένα ατομικά μαζί (π.χ. export/backup πρώτα, μετά καθαρισμός και των δύο) — εκτός
// scope εδώ, ΔΕΝ χτίζεται πρόωρα.
//
// Η παρακάτω συνάρτηση υπάρχει ΑΠΟΚΛΕΙΣΤΙΚΑ για να μπορούν τα ίδια τα tests αυτού του module να
// επαναφέρουν καθαρή κατάσταση μεταξύ τους (ίδιο idiom με resetMigrationForTests στο
// migrationEngine.js) — ΔΕΝ αντιπροσωπεύει προτεινόμενο production API, δεν πρέπει να καλείται από
// κανένα production code path.
export async function resetLegacyOwnershipForTests() {
  await db.appMeta.delete(OWNER_KEY)
}
