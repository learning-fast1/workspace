import db from '../db.js'
import { currentUserIdOrNull, getActiveGeneration, getRestoreFinalizationState } from './activeGeneration.js'
import { getLegacyDataOwner } from './legacyOwnership.js'
import { getMigrationState } from './migrationEngine.js'
import { readSyncAuthorizationHint, writeSyncAuthorizationHint, clearSyncAuthorizationHint } from './syncAuthorizationHint.js'

// Sprint 5A Phase 2, Commit 6 — ΞΕΧΩΡΙΣΤΟ module από το syncAuthorizationHint.js (review, σκόπιμα):
// αυτό εδώ ΕΞΑΡΤΑΤΑΙ από db.js/άλλα migration/*.js modules (τα οποία ΚΑΙ ΤΑ ΙΔΙΑ εξαρτώνται από
// db.js) — το ΙΔΙΟ το db.js ΔΕΝ εισάγει ΠΟΤΕ από εδώ (μόνο από το dependency-free hint module) ώστε
// η ΚΡΙΣΙΜΗ, πριν-το-open ανάγνωση του hint να ΜΗΝ εξαρτάται καθόλου από τον κύκλο db.js↔εδώ.

// appMeta.value ΔΕΝ σχηματίζεται εδώ, μόνο ΔΙΑΒΑΖΕΤΑΙ (μέσω των ήδη υπαρχόντων getters των άλλων
// modules) — μία ΜΟΝΟ πηγή αλήθειας ανά state machine, όπως παντού αλλού σε αυτό το Phase 2.
const REASON_MESSAGES = {
  NO_USER: 'Απαιτείται συνδεδεμένος χρήστης.',
  OWNERSHIP_MISMATCH: 'Τα τοπικά δεδομένα αυτής της συσκευής δεν ανήκουν (ακόμα) σε αυτόν τον χρήστη.',
  MIGRATION_INCOMPLETE: 'Η προετοιμασία των δεδομένων δεν έχει ολοκληρωθεί ακόμα.',
  GENERATION_NOT_V2: 'Η νέα έκδοση δεδομένων δεν είναι ακόμα ενεργή σε αυτή τη συσκευή.',
  RESTORE_FINALIZATION_NOT_OK: 'Μια πρόσφατη επαναφορά αντιγράφου ασφαλείας δεν έχει ολοκληρωθεί ακόμα.',
  HINT_USER_MISMATCH: 'Ο συνδεδεμένος χρήστης δεν ταιριάζει με την τελευταία εξουσιοδότηση συγχρονισμού.'
}

// Οι 4 προϋποθέσεις, ΑΚΡΙΒΩΣ όπως ζητήθηκαν, με αυτή τη σειρά (η πρώτη που αποτυγχάνει σταματάει
// τον έλεγχο — καμία ανάγκη να αξιολογηθούν οι υπόλοιπες). Παίρνει ΗΔΗ-resolved userId (όχι getter)
// — ίδιο idiom με assertLegacyDataOwnership/verifyMigration κ.λπ. — ο καλών αποφασίζει ΠΩΣ βρίσκει
// τον authenticated χρήστη.
export async function checkSyncPrerequisites(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return { ok: false, reason: 'NO_USER' }
  }

  const owner = await getLegacyDataOwner()
  if (!owner || owner.userId !== userId) {
    return { ok: false, reason: 'OWNERSHIP_MISMATCH' }
  }

  const migrationState = await getMigrationState(userId)
  if (migrationState.status !== 'complete') {
    return { ok: false, reason: 'MIGRATION_INCOMPLETE' }
  }

  const generation = await getActiveGeneration(userId)
  if (generation !== 'v2') {
    return { ok: false, reason: 'GENERATION_NOT_V2' }
  }

  const finalization = await getRestoreFinalizationState()
  if (finalization && (finalization.status === 'pending' || finalization.status === 'failed')) {
    return { ok: false, reason: 'RESTORE_FINALIZATION_NOT_OK' }
  }

  return { ok: true, reason: null }
}

export function syncPrerequisiteMessage(reason) {
  return REASON_MESSAGES[reason] || 'Δεν πληρούνται οι προϋποθέσεις συγχρονισμού.'
}

// Κατάσταση ΑΥΤΗΣ ΤΗΣ σελίδας-φόρτωσης — ΞΕΧΩΡΙΣΤΗ από το (μη έμπιστο) localStorage hint, ΞΕΧΩΡΙΣΤΗ
// από το appMeta. Γράφεται ΜΟΝΟ από verifySyncAuthorizationOrShutdown (μετά από ΠΡΑΓΜΑΤΙΚΗ
// επιβεβαίωση) και από deactivateSessionSync (review, verbatim: «Reset any in-memory
// sync-authorization state immediately» — καλείται από auth/signOut.js).
let sessionSyncActive = false

export function isSessionSyncActive() {
  return sessionSyncActive
}

export function deactivateSessionSync() {
  sessionSyncActive = false
}

// ΑΜΕΣΩΣ μετά το db.open() (main.jsx bootstrap, πριν το πρώτο render) — ΞΑΝΑ-επιβεβαιώνει ΤΙΣ 4
// προϋποθέσεις πάνω στα ΠΡΑΓΜΑΤΙΚΑ appMeta/currentUser, ΠΟΤΕ εμπιστεύεται το hint από μόνο του
// (review, verbatim: «the hint must never grant educational-data access or override appMeta
// state»). Αναντιστοιχία ΟΠΟΙΟΥΔΗΠΟΤΕ είδους (λείπει, malformed, stale, ανακληθέν, διαφορετικός
// χρήστης) → ΑΜΕΣΗ απενεργοποίηση: configure() ΞΑΝΑ με την ΠΛΗΡΗ λίστα (η φορά που πάντα δουλεύει,
// βλ. syncAuthorizationHint.js) + καθαρισμός hint + μηδενισμός in-memory state. Fail-closed σε ΚΑΘΕ
// κλάδο — καμία εξαίρεση ανάμεσα σε ownership mismatch/missing userId/incomplete migration/legacy
// generation/failed restore finalization, ΟΛΑ περνούν από το ΙΔΙΟ checkSyncPrerequisites.
export async function verifySyncAuthorizationOrShutdown({
  getAuthenticatedUserId = currentUserIdOrNull,
  configure = (opts) => db.cloud && db.cloud.configure(opts)
} = {}) {
  const hint = readSyncAuthorizationHint()
  if (!hint) {
    deactivateSessionSync()
    return false
  }

  const authenticatedUserId = getAuthenticatedUserId()
  const result = authenticatedUserId && authenticatedUserId === hint
    ? await checkSyncPrerequisites(authenticatedUserId)
    : { ok: false, reason: 'HINT_USER_MISMATCH' }

  if (result.ok) {
    sessionSyncActive = true
    return true
  }

  configure({ unsyncedTables: db.tables.map((t) => t.name) })
  clearSyncAuthorizationHint()
  deactivateSessionSync()
  return false
}

// Ρητή, χρήστη-ενεργοποιημένη ενέργεια (EnableSyncSection.jsx) — ΞΑΝΑ-ελέγχει τις προϋποθέσεις ΤΩΡΑ
// (ζωντανά, ΟΧΙ από cache) και, αν περάσουν, γράφει ΜΟΝΟ το hint. ΔΕΝ καλεί configure() εδώ (review,
// evidence-based εύρημα: μια δεύτερη configure() ΜΕΣΑ στην ΙΔΙΑ φόρτωση δεν έχει ΚΑΝΕΝΑ αποτέλεσμα
// στο ήδη-ενεργό markedForSync αυτής της φόρτωσης, βλ. syncAuthorizationHint.js) — το hint αποκτά
// νόημα ΜΟΝΟ στην ΕΠΟΜΕΝΗ φόρτωση, άρα ΥΠΟΧΡΕΩΤΙΚΟ πλήρες reload μετά, ίδιο μοτίβο με
// activateV2Generation/GenerationSwitchoverSection.
export async function activateSyncForCurrentUser({ getAuthenticatedUserId = currentUserIdOrNull } = {}) {
  const userId = getAuthenticatedUserId()
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error(REASON_MESSAGES.NO_USER)
  }
  const result = await checkSyncPrerequisites(userId)
  if (!result.ok) {
    throw new Error(syncPrerequisiteMessage(result.reason))
  }
  writeSyncAuthorizationHint(userId)
  return { userId }
}

// Test-only — ίδιο idiom με resetActiveGenerationForTests. ΔΕΝ αγγίζει appMeta/localStorage, μόνο
// το in-memory session state.
export function resetSessionSyncForTests() {
  sessionSyncActive = false
}
