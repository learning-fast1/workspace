import { db, CLOUD_ENABLED } from '../db.js'
import { MIGRATED_TABLE_NAMES, v2TableName } from './migratedTableNames.js'
import { assertLegacyDataOwnership } from './legacyOwnership.js'
import { getMigrationState } from './migrationEngine.js'

// Sprint 5A Phase 2, Commit 4A — ΠΟΙΑ γενιά πινάκων (legacy ή _v2) διαβάζει/γράφει η εφαρμογή σε
// αυτή τη συσκευή, ΓΙΑ αυτόν τον χρήστη. appMeta ΠΑΡΑΜΕΝΕΙ η μοναδική πηγή αλήθειας — το
// module-level cache παρακάτω είναι ΑΠΟΚΛΕΙΣΤΙΚΑ ένα καθρέφτισμα (mirror) της τελευταίας γνωστής
// τιμής, ΠΟΤΕ ανεξάρτητη πηγή. Ρητή απόφαση (review): ΕΝΑΣ εσωτερικός setter (setCachedGeneration)
// γράφει το cache — καλείται ΜΟΝΟ από τα 3 σημεία που έχουν νόημα: initializeActiveGeneration
// (εκκίνηση εφαρμογής), activateV2Generation (η ίδια η ενεργοποίηση), resetActiveGenerationForTests
// (test-only καθαρισμός). Το ίδιο το activeTable() ΔΙΑΒΑΖΕΙ μόνο, ΠΟΤΕ γράφει.
const ACTIVE_GENERATION_KEY = 'phase2ActiveGeneration'

let cachedGeneration = 'legacy'

function setCachedGeneration(generation) {
  cachedGeneration = generation
}

// Μη-throwing εκδοχή του ήδη υπάρχοντος idiom (legacyOwnership.js/migrationEngine.js
// defaultGetAuthenticatedUserId) — ΕΔΩ χρειάζεται να ΜΗΝ πετάξει ποτέ, αφού καλείται από το
// bootstrap του main.jsx πριν καν αποδοθεί η εφαρμογή· ένα throw εδώ θα εμπόδιζε ΚΑΘΕ φόρτωση,
// ακόμα και αμιγώς τοπική χρήση χωρίς cloud. null = «δεν υπάρχει authenticated χρήστης αυτή τη
// στιγμή» (CLOUD_ENABLED=false, ή συνδεδεμένος αλλά χωρίς έγκυρο userId) — ΟΧΙ σφάλμα.
function defaultGetUserIdOrNull() {
  if (!CLOUD_ENABLED) return null
  const currentUser = db.cloud?.currentUser?.value
  return (currentUser?.isLoggedIn && currentUser.userId) || null
}

// Δημόσια εκδοχή του παραπάνω — επαναχρησιμοποιείται από το ensureDomainTemplatesSeeded (db.js)
// για τα deterministic seed ids του Commit 4C, αντί για ένα 4ο ιδιωτικό αντίγραφο του ίδιου idiom.
export function currentUserIdOrNull() {
  return defaultGetUserIdOrNull()
}

// Συγχρονική ανάγνωση του cache — χρησιμοποιείται όπου ένας καλών χρειάζεται να ΚΛΑΔΕΨΕΙ τη δική
// του λογική ανά γενιά (π.χ. ensureDomainTemplatesSeeded: deterministic id ΜΟΝΟ όταν v2), αντί να
// περάσει από το activeTable() που απαιτεί ήδη γνωστό όνομα πίνακα.
export function getCachedGeneration() {
  return cachedGeneration
}

// appMeta.value shape: { generation:'v2', userId:string, setAt:ISOString }. Η ΑΠΟΥΣΙΑ εγγραφής
// σημαίνει legacy — ΔΕΝ γράφεται ποτέ ρητά τιμή 'legacy' (καμία λειτουργία «επαναφοράς» σε αυτό
// το commit, βλ. review — η ρύθμιση εξ ορισμού ΕΙΝΑΙ η απουσία εγγραφής).
//
// Fail-closed σε ΚΑΘΕ βήμα (review): λείπει η εγγραφή, ΟΧΙ generation:'v2', λείπει/δεν ταιριάζει
// το userId → πάντα 'legacy'. Ένα marker που άφησε διαφορετικός λογαριασμός στην ΙΔΙΑ συσκευή
// ΠΟΤΕ δεν κληρονομείται σιωπηλά — ίδια αρχή ιδιοκτησίας-ανά-χρήστη με το legacyDataOwner
// (legacyOwnership.js) και το phase2MigrationState (migrationEngine.js).
export async function getActiveGeneration(userId) {
  const row = await db.appMeta.get(ACTIVE_GENERATION_KEY)
  const marker = row?.value
  if (!marker || marker.generation !== 'v2') return 'legacy'
  if (!userId || marker.userId !== userId) return 'legacy'
  return 'v2'
}

// Καλείται ΜΙΑ φορά, στο ήδη υπάρχον pre-render bootstrap chain του main.jsx — πριν αποδοθεί
// ΟΠΟΙΟΔΗΠΟΤΕ component, άρα το activeTable() είναι ήδη σωστό από το ΠΡΩΤΟ render, καμία
// «αναλαμπή» legacy→v2. Αφού η εναλλαγή γενιάς απαιτεί ΥΠΟΧΡΕΩΤΙΚΟ πλήρες reload (review — καμία
// in-place αντιδραστική εναλλαγή), το cache παραμένει σταθερό για ΟΛΗ τη διάρκεια ζωής της σελίδας
// εκτός από την ίδια την ενεργοποίηση παρακάτω.
export async function initializeActiveGeneration({ getUserId = defaultGetUserIdOrNull } = {}) {
  const userId = getUserId()
  const generation = await getActiveGeneration(userId)
  setCachedGeneration(generation)
  return generation
}

// Η ΜΟΝΑΔΙΚΗ πράξη ενεργοποίησης της v2 γενιάς. Idempotent για τον ΙΔΙΟ χρήστη· ΠΕΤΑΕΙ σε ΚΑΘΕ
// άλλη περίπτωση — καμία σιωπηλή αποτυχία. Ελέγχει με αυτή ΑΚΡΙΒΩΣ τη σειρά (review, «impossible
// for»): 1) το userId ταιριάζει με τον πραγματικά authenticated χρήστη (spoofing) — 2) τα legacy
// δεδομένα αυτής της συσκευής ανήκουν ήδη ρητά σε αυτόν τον χρήστη (assertLegacyDataOwnership,
// ήδη πετάει LEGACY_OWNER_UNCLAIMED/LEGACY_OWNER_MISMATCH) — 3) το migration αυτού του χρήστη
// έχει φτάσει ΠΡΑΓΜΑΤΙΚΑ σε 'complete' (όχι απλώς «δεν πέταξε»). ΜΟΝΟ ΤΟΤΕ γράφεται το appMeta
// marker ΚΑΙ ενημερώνεται το cache — δύο ξεχωριστά βήματα, ΟΧΙ ένα, ώστε το appMeta να παραμένει
// η πηγή αλήθειας ακόμα κι αν το δεύτερο βήμα (cache) ποτέ δεν έτρεχε.
export async function activateV2Generation(userId, { getAuthenticatedUserId = defaultGetUserIdOrNull, getMigrationState: getMigrationStateFn = getMigrationState } = {}) {
  const authenticatedUserId = getAuthenticatedUserId()
  if (!authenticatedUserId || userId !== authenticatedUserId) {
    throw new Error('Το userId της ενεργοποίησης πρέπει να ταιριάζει με τον τρέχοντα συνδεδεμένο χρήστη.')
  }

  await assertLegacyDataOwnership(userId)

  const migrationState = await getMigrationStateFn(userId)
  if (migrationState.status !== 'complete') {
    const err = new Error(
      'Η προετοιμασία των δεδομένων δεν έχει ολοκληρωθεί ακόμα — δεν μπορεί να ενεργοποιηθεί η νέα έκδοση.'
    )
    err.code = 'MIGRATION_NOT_COMPLETE'
    throw err
  }

  const existingRow = await db.appMeta.get(ACTIVE_GENERATION_KEY)
  const existingMarker = existingRow?.value
  if (existingMarker?.generation === 'v2' && existingMarker.userId === userId) {
    setCachedGeneration('v2')
    return existingMarker
  }

  const marker = { generation: 'v2', userId, setAt: new Date().toISOString() }
  await db.appMeta.put({ key: ACTIVE_GENERATION_KEY, value: marker })
  setCachedGeneration('v2')
  return marker
}

// Συγχρονικό, σκόπιμα — χρησιμοποιείται μέσα σε query αλυσίδες (activeTable('students').where(...))
// ίδιο σχήμα με το db.students σήμερα. Διαβάζει ΜΟΝΟ το ήδη-αρχικοποιημένο cache, ΠΟΤΕ το ίδιο το
// appMeta απευθείας (θα ήταν async, θα έσπαγε κάθε υπάρχον call site). Πετάει για όνομα εκτός
// MIGRATED_TABLE_NAMES — άμυνα ενάντια σε κατά λάθος routing του appMeta ή άλλου μη-εκπαιδευτικού
// πίνακα.
export function activeTable(name) {
  if (!MIGRATED_TABLE_NAMES.includes(name)) {
    throw new Error(`activeTable: το "${name}" δεν είναι γνωστός εκπαιδευτικός πίνακας (βλ. MIGRATED_TABLE_NAMES).`)
  }
  return db.table(cachedGeneration === 'v2' ? v2TableName(name) : name)
}

// Test-only — ίδιο idiom με resetMigrationForTests/resetLegacyOwnershipForTests. ΔΕΝ αγγίζει
// legacy/_v2 εκπαιδευτικά δεδομένα, μόνο το appMeta marker ΚΑΙ το cache.
//
// clearPersisted:false (Commit 4C) — προσομοιώνει ένα ΠΡΑΓΜΑΤΙΚΟ hard reload: το in-memory cache
// επιστρέφει στην προεπιλογή του (όπως θα συνέβαινε αν ξαναφορτωνόταν ολόκληρο το JS heap), ΧΩΡΙΣ
// να σβήσει το ήδη-persisted appMeta marker (αυτό ζει στο IndexedDB, επιβιώνει σε reload — ΑΚΡΙΒΩΣ
// όπως στην πραγματική εφαρμογή). Το default (true) παραμένει το ίδιο πλήρες καθάρισμα με πριν,
// για τα ΗΔΗ υπάρχοντα afterEach hooks σε άλλα test αρχεία — καμία αλλαγή συμπεριφοράς εκεί.
export async function resetActiveGenerationForTests({ clearPersisted = true } = {}) {
  if (clearPersisted) await db.appMeta.delete(ACTIVE_GENERATION_KEY)
  setCachedGeneration('legacy')
}

// Sprint 5A Phase 2, Commit 4C — id για ΝΕΕΣ γραμμές που δημιουργούνται ΜΕΤΑ τη μετάβαση σε v2.
// ΞΕΧΩΡΙΣΤΟ από το deterministicId του migration engine (εκείνο είναι ΜΟΝΟ για ιστορικές,
// ήδη-υπάρχουσες legacy γραμμές — παραμένει αναλλοίωτο, δεν το αντικαθιστά αυτό).
//
// legacy: no-op (επιστρέφει τα fields αμετάβλητα) — ΚΑΝΕΝΑ πεδίο id προστίθεται, το ήδη υπάρχον
// '++id' auto-increment της Dexie συνεχίζει να δουλεύει ΑΚΡΙΒΩΣ όπως σήμερα, μηδενική αλλαγή
// συμπεριφοράς. v2: crypto.randomUUID() — ΣΥΓΧΡΟΝΟ (σε αντίθεση με το crypto.subtle.digest του
// deterministicId), άρα ασφαλές να κληθεί οπουδήποτε, ΚΑΙ μέσα σε ανοιχτή/ένθετη db.transaction(),
// χωρίς τον ήδη τεκμηριωμένο κίνδυνο "Transaction committed too early" (βλ. migrationEngine.js).
//
// Επιβεβαιωμένο ενάντια στο πραγματικό dexie-cloud-addon source (review, πριν την υλοποίηση):
// τα _v2 tables δηλώνονται με απλό 'id' (ΟΧΙ '@id') — το addon's idGenerationMiddleware ΔΕΝ
// αναλαμβάνει καθόλου την παραγωγή id για τέτοιους πίνακες· απαιτεί μόνο το key να είναι string
// (isValidSyncableID) όποτε/αν ο πίνακας μπει ποτέ σε πραγματικό sync — ένα crypto.randomUUID()
// παραμένει έγκυρο τότε χωρίς καμία αλλαγή.
// Review (μετά την πρώτη υλοποίηση): { id: crypto.randomUUID(), ...fields } θα επέτρεπε σε ένα
// τυχόν fields.id (π.χ. copy/spread από υπάρχουσα γραμμή) να ΥΠΕΡΓΡΑΨΕΙ το παραγόμενο uuid μετά
// το spread — μια «νέα» γραμμή θα μπορούσε αθόρυβα να ξαναχρησιμοποιήσει ΠΑΛΙΟ id (αριθμητικό
// legacy id, ή ήδη υπαρκτό v2 uuid), προκαλώντας bulkPut overwrite πάνω σε άσχετη υπάρχουσα
// γραμμή. Τώρα το caller-supplied id αφαιρείται ΠΑΝΤΑ πρώτα, και το παραγόμενο id μπαίνει
// ΤΕΛΕΥΤΑΙΟ — δομικά αδύνατο οποιοδήποτε fields.id να επιβιώσει σε v2 δημιουργία.
export function withNewRowId(fields) {
  if (cachedGeneration !== 'v2') return fields
  const { id: _callerSuppliedId, ...rest } = fields
  return { ...rest, id: crypto.randomUUID() }
}
