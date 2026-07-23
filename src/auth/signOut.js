import db from '../db.js'
import {
  captureFullDeviceSnapshot, restoreFullDeviceSnapshot,
  persistPendingSnapshot, readPendingSnapshot, clearPendingSnapshot
} from '../migration/deviceSnapshot.js'
import { clearSyncAuthorizationHint } from '../migration/syncAuthorizationHint.js'
import { deactivateSessionSync } from '../migration/syncAuthorization.js'

// Sprint 5A Phase 2, Commit 6 — review, evidence-based εύρημα ενάντια στο πραγματικό installed
// dexie-cloud-addon source (dist/modern/dexie-cloud-addon.js): το ΜΟΝΑΔΙΚΟ δημόσιο sign-out API
// είναι db.cloud.logout({force}) — ΚΑΙ ΟΙ ΔΥΟ κλάδοι του (force:true/false) καταλήγουν σε _logout(),
// το οποίο καθαρίζει ΚΑΘΕ πίνακα της βάσης (db.dx.tables) ΕΚΤΟΣ από τα δικά του $jobs/$syncState —
// legacy, _v2, appMeta, ΟΛΑ. Δεν υπάρχει άλλη δημόσια μέθοδος (login/logout/configure/sync/
// permissions/getAuthProviders — ολόκληρο το DexieCloudAPI) που να «αποσυνδέει» χωρίς αυτή την
// πλευρική ενέργεια. Καμία χειροκίνητη επέμβαση σε undocumented internal tables (π.χ. $logins) —
// αυτό ΘΑ ήταν ακριβώς το είδος του μη-τεκμηριωμένου μονοπατιού που η ανασκόπηση απαγόρευσε ρητά.
//
// Λύση: χρησιμοποιείται το ΙΔΙΟ, μοναδικό, τεκμηριωμένο API (db.cloud.logout({force:true}) — το
// force:true αποφεύγει το εσωτερικό confirmLogout() prompt του addon, το οποίο θα προειδοποιούσε
// για απώλεια δεδομένων που ΔΕΝ πρόκειται να συμβεί εδώ, αφού αναιρείται αμέσως παρακάτω) — αλλά η
// καταστροφική πλευρική του ενέργεια αναιρείται ΑΜΕΣΩΣ, ΑΚΡΙΒΩΣ (byte-for-byte, μέσω
// migration/deviceSnapshot.js) — ΟΧΙ μέσω επανερμηνείας/migration-εκ-νέου (utils/backup.js) που θα
// άλλαζε λεπτομέρειες όπως ownership claim state.
//
// Review (2η αναθεώρηση — μετρήθηκε, όχι εκτιμήθηκε): το πρώτο σχέδιο έγραφε το στιγμιότυπο σε
// localStorage — μετρημένο χειρότερο ρεαλιστικό μέγεθος (150 μαθητές/12 χρόνια ιστορικού, ΚΑΙ οι
// δύο γενιές γεμάτες, βλ. migration/deviceSnapshot.test.js) ~36MB, 7x πάνω από το τυπικό όριο
// localStorage (~5MB/origin). Διορθώθηκε: το ΙΔΙΟ το στιγμιότυπο γράφεται τώρα σε μια ξεχωριστή,
// αυτόνομη IndexedDB βάση (migration/deviceSnapshot.js#persistPendingSnapshot — 'workspace-signout-
// safety', ΟΧΙ το 'workspace' instance που το db.cloud.logout() καθαρίζει), με άφθονη χωρητικότητα.
// Το localStorage παραμένει ΜΟΝΟ για το μικροσκοπικό sync-authorization hint (χρειάζεται συγχρονική
// ανάγνωση πριν το db.open(), κάτι που το IndexedDB δεν προσφέρει ποτέ).
//
// Σειρά (ΚΑΘΕ βήμα ΑΚΡΙΒΩΣ όπως ζητήθηκε):
// 1) Durable αντίγραφο ασφαλείας ΠΡΙΝ αλλάξει οτιδήποτε στην ταυτότητα — επιβιώνει ΚΑΙ ένα crash
//    του browser ανάμεσα στα βήματα 3 και 4.
// 2) Καθαρισμός sync-authorization hint ΚΑΙ μηδενισμός in-memory session state — ΑΜΕΣΩΣ, πριν καν
//    κληθεί το logout() του addon.
// 3) Το ΜΟΝΑΔΙΚΟ τεκμηριωμένο sign-out API.
// 4) Ακριβής αναίρεση της καταστροφικής πλευρικής ενέργειας.
// 5) Καθαρισμός του προσωρινού αντιγράφου — ΜΟΝΟ μετά από ΕΠΙΤΥΧΗ αναίρεση.
export async function signOut({ cloudLogout = () => db.cloud.logout({ force: true }) } = {}) {
  const snapshot = await captureFullDeviceSnapshot()
  await persistPendingSnapshot(snapshot)

  clearSyncAuthorizationHint()
  deactivateSessionSync()

  await cloudLogout()
  await restoreFullDeviceSnapshot(snapshot)

  await clearPendingSnapshot()
}

// Ασφαλιστική δικλείδα (review): αν η αναίρεση στο βήμα 4 παραπάνω αποτύχει ΜΕΤΑ από επιτυχές
// cloudLogout() (π.χ. σφάλμα transaction) — το προσωρινό αντίγραφο ΔΕΝ έχει καθαριστεί (μόνο
// επιτυχία το καθαρίζει, βλ. παραπάνω) — αυτή η συνάρτηση επιτρέπει χειροκίνητη/μελλοντική ανάκτηση
// από ΑΚΡΙΒΩΣ αυτό το στιγμιότυπο, χωρίς να χρειάζεται νέα αποσύνδεση.
export async function recoverFromStoredSnapshot() {
  const snapshot = await readPendingSnapshot()
  if (!snapshot) return false
  await restoreFullDeviceSnapshot(snapshot)
  await clearPendingSnapshot()
  return true
}
