import { db, CLOUD_ENABLED, DATA_TABLE_NAMES } from '../db.js'
import { MIGRATED_TABLE_NAMES, v2TableName, legacyPrimaryKeyField, assertMigratedTablesComplete } from './migratedTableNames.js'
import { FOREIGN_KEY_MAP } from './foreignKeyMap.js'
import { mapRowForMigration, mapRowsForMigration } from './rowMapper.js'
import { assertLegacyDataOwnership, resetLegacyOwnershipForTests } from './legacyOwnership.js'
import { TOLERATED_ORPHAN_FOREIGN_KEYS, findToleratedOrphanEntry } from './orphanAllowlist.js'

const STATE_KEY = 'phase2MigrationState'

// appMeta.value shape (βλ. Phase 2 Technical Plan, Commit 2 §state):
// {
//   version: 1,
//   userId: string,                    // ΠΟΙΟΣ authenticated χρήστης έτρεξε αυτό το migration
//   status: 'not_started'|'in_progress'|'verifying'|'complete'|'failed',
//   startedAt, updatedAt, completedAt: ISOString|null,
//   tables: { [tableName]: { status:'pending'|'done'|'failed', migratedCount:number, error:string|null } },
//   verification: null | { status:'passed'|'failed', checkedAt:ISOString, issues:[{table,type,detail}] },
//   lastError: null | { table:string|null, message:string, at:ISOString }
// }
function freshState(userId) {
  return {
    version: 1,
    userId,
    status: 'not_started',
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    tables: Object.fromEntries(
      MIGRATED_TABLE_NAMES.map((t) => [t, { status: 'pending', migratedCount: 0, error: null }])
    ),
    verification: null,
    lastError: null
  }
}

// Διαβάζει το τρέχον state από το appMeta. Αν δεν υπάρχει ΚΑΘΟΛΟΥ, ή αν ανήκει σε ΔΙΑΦΟΡΕΤΙΚΟ χρήστη
// (π.χ. διαφορετικός λογαριασμός συνδέθηκε στην ίδια συσκευή) επιστρέφει ΦΡΕΣΚΟ state για τον
// τρέχοντα χρήστη — ΔΕΝ ξαναχρησιμοποιεί ποτέ την πρόοδο ενός άλλου userId (βλ. σχόλιο παρακάτω στο
// runMigration για τον περιορισμό αυτής της προσέγγισης).
export async function getMigrationState(userId) {
  const row = await db.appMeta.get(STATE_KEY)
  if (!row || row.value.userId !== userId) return freshState(userId)
  return row.value
}

async function persistState(state) {
  state.updatedAt = new Date().toISOString()
  await db.appMeta.put({ key: STATE_KEY, value: state })
}

function defaultGetAuthenticatedUserId() {
  if (!CLOUD_ENABLED) {
    throw new Error('Το migration απαιτεί ενεργό cloud sync (CLOUD_ENABLED) — δεν εφαρμόζεται σε αμιγώς τοπική χρήση.')
  }
  const currentUser = db.cloud?.currentUser?.value
  if (!currentUser?.isLoggedIn || !currentUser?.userId) {
    throw new Error('Το migration απαιτεί συνδεδεμένο χρήστη — δεν βρέθηκε έγκυρο authenticated userId.')
  }
  return currentUser.userId
}

// ΣΚΟΠΙΜΑ το διάβασμα + το deterministic remapping (mapRowsForMigration, βλ. rowMapper.js) γίνονται
// ΕΚΤΟΣ Dexie transaction — το remapping περνάει από crypto.subtle.digest() (μη-Dexie async εργασία)
// και η Dexie transaction ζώνη «σπάει» αν μια transaction callback κάνει await σε κάτι που δεν είναι
// η ίδια η Dexie promise chain (ζωντανά επιβεβαιωμένο: "Transaction committed too early" όταν
// δοκιμάστηκε με το remapping ΜΕΣΑ στην transaction). Η ΙΔΙΑ η εγγραφή (bulkPut) παραμένει ατομική
// από μόνη της — μία bulkPut κλήση είναι ήδη all-or-nothing, δεν χρειάζεται επιπλέον wrapper.
// Ρεαλιστικός όγκος δεδομένων για μία εκπαιδευτικό σε μία συσκευή (δεκάδες/λίγες εκατοντάδες γραμμές
// ανά πίνακα) — μία bulkPut ανά πίνακα είναι ασφαλής και απλή: είτε ΟΛΟΚΛΗΡΟΣ ο πίνακας μεταφέρθηκε
// επιτυχώς είτε ΚΑΘΟΛΟΥ, άρα δεν υπάρχει ποτέ μισο-μεταφερμένος πίνακας να καθαριστεί σε επόμενη
// προσπάθεια — το resume απλά ξαναπροσπαθεί τον ΙΔΙΟ πίνακα από την αρχή (idempotent χάρη στο
// deterministic id + bulkPut). Αν κάποτε ένας πίνακας μεγαλώσει πολύ (εκτός ρεαλιστικού σεναρίου
// αυτής της εφαρμογής), η φυσική επόμενη βελτίωση είναι chunked bulkPut κλήσεις, όχι αλλαγή
// αρχιτεκτονικής.
async function migrateTable(userId, tableName) {
  const targetName = v2TableName(tableName)
  const legacyTable = db.table(tableName)
  const targetTable = db.table(targetName)

  const rows = await legacyTable.toArray()
  const mapped = await mapRowsForMigration(userId, tableName, rows)
  if (mapped.length > 0) {
    await targetTable.bulkPut(mapped)
  }
  return mapped.length
}

// Ελέγχει, ΜΕΤΑ την επιτυχή μεταφορά ΟΛΩΝ των πινάκων, ότι: (1) κάθε legacy γραμμή έχει πράγματι
// την αντίστοιχη _v2 γραμμή της (κανένα «drop» — αυστηρός έλεγχος, ΠΑΝΤΑ μπλοκάρει), και (2) κάθε
// ΜΗ-null foreign key σε _v2 γραμμή δείχνει σε ΥΠΑΡΚΤΗ γραμμή του πίνακα-στόχου. Το (2) ΜΠΛΟΚΑΡΕΙ
// επίσης εξ ορισμού — ένα «κρεμασμένο» μη-null FK περνάει ΜΟΝΟ αν το (table, field) βρίσκεται ρητά
// στο TOLERATED_ORPHAN_FOREIGN_KEYS (βλ. orphanAllowlist.js, άδειο εξ ορισμού). ΚΑΜΙΑ σιωπηλή
// ανοχή — μια ΜΗ ταξινομημένη (unclassified) παραβίαση ΠΑΝΤΑ μπλοκάρει την ολοκλήρωση.
export async function verifyMigration(userId, { allowlist = TOLERATED_ORPHAN_FOREIGN_KEYS } = {}) {
  const issues = []

  for (const tableName of MIGRATED_TABLE_NAMES) {
    const legacyTable = db.table(tableName)
    const targetTable = db.table(v2TableName(tableName))
    const legacyRows = await legacyTable.toArray()
    const pkField = legacyPrimaryKeyField(tableName)

    for (const row of legacyRows) {
      const expected = await mapRowForMigration(userId, tableName, row)
      const actual = await targetTable.get(expected.id)
      if (!actual) {
        issues.push({
          table: tableName, targetTable: null, field: null, sourceRowId: row[pkField], reason: null,
          type: 'missing_v2_row', detail: `legacy ${pkField}=${row[pkField]} → δεν βρέθηκε _v2 id=${expected.id}`
        })
      }
    }
  }

  // Έλεγχος αναφορικής ακεραιότητας — ΣΚΟΠΙΜΑ πάνω στα ΙΔΙΑ τα legacy δεδομένα (όχι στα ήδη-
  // μεταφερμένα _v2), για δύο λόγους: (1) δίνει το αναγνωρίσιμο legacy id/key στο issue αντί για
  // ένα αδιαφανές hash, χρήσιμο σε όποιον διαβάζει/διορθώνει το πρόβλημα, και (2) είναι ΑΚΡΙΒΩΣ το
  // ίδιο ερώτημα που μια «επιδιόρθωση legacy δεδομένων» (βλ. runMigration παρακάτω, ανάκτηση μετά
  // από αποτυχία) πρέπει να ικανοποιήσει — ελέγχει τη ΡΙΖΑ του προβλήματος, όχι το σύμπτωμά του.
  // ΚΑΘΕ μη-null FK που δεν βρίσκει τη γραμμή-στόχο ταξινομείται ΡΗΤΑ σε tolerated (υπάρχει στην
  // allowlist, ΜΕ reason) ή unclassified (ΔΕΝ υπάρχει — μπλοκάρει).
  for (const tableName of MIGRATED_TABLE_NAMES) {
    const fkFields = FOREIGN_KEY_MAP[tableName]
    if (!fkFields) continue
    const pkField = legacyPrimaryKeyField(tableName)
    const rows = await db.table(tableName).toArray()
    for (const [field, target] of Object.entries(fkFields)) {
      const targetTableName = typeof target === 'string' ? target : target.table
      const isArray = typeof target === 'object' && target.array === true
      const legacyTargetTable = db.table(targetTableName)
      const toleratedEntry = findToleratedOrphanEntry(tableName, field, allowlist)
      for (const row of rows) {
        const values = isArray ? (row[field] || []) : [row[field]]
        for (const value of values) {
          if (value === null || value === undefined) continue
          const exists = await legacyTargetTable.get(value)
          if (!exists) {
            issues.push({
              table: tableName,
              targetTable: targetTableName,
              field,
              sourceRowId: row[pkField],
              type: toleratedEntry ? 'tolerated_orphan_foreign_key' : 'orphaned_foreign_key',
              reason: toleratedEntry?.reason || null,
              detail: `${tableName}.${field}=${value} (legacy ${pkField}=${row[pkField]}) δεν βρέθηκε στο legacy ${targetTableName}`
            })
          }
        }
      }
    }
  }

  // ΜΟΝΟ το 'tolerated_orphan_foreign_key' δεν μπλοκάρει — 'missing_v2_row' ΚΑΙ το ΜΗ ταξινομημένο
  // 'orphaned_foreign_key' μπλοκάρουν ΠΑΝΤΑ, χωρίς εξαίρεση.
  const hardFailures = issues.filter((i) => i.type === 'missing_v2_row' || i.type === 'orphaned_foreign_key')

  return {
    status: hardFailures.length === 0 ? 'passed' : 'failed',
    checkedAt: new Date().toISOString(),
    issues
  }
}

// Ανάκτηση μετά από αποτυχία ΣΤΟ VERIFICATION (όχι σε κάποιον πίνακα) — βλ. review: χωρίς αυτό, ένα
// migration που πέτυχε ΚΑΙ στους 16 πίνακες (όλοι 'done') αλλά απέτυχε στο τελικό verification θα
// έμενε ΜΟΝΙΜΑ κολλημένο, ακόμα κι αφού διορθωθούν τα υποκείμενα legacy δεδομένα — το runMigration
// θα παρέκαμπτε ΟΛΟΥΣ τους ήδη-'done' πίνακες και θα ξαναεπαλήθευε τα ΙΔΙΑ, μπαγιάτικα _v2 δεδομένα.
//
// Λύση: για ΚΑΘΕ issue που μπλόκαρε το verification, μαρκάρουμε ΞΑΝΑ σε 'pending' (1) τον πίνακα
// που «ανήκει» η προβληματική γραμμή, ΚΑΙ (2) — μόνο για ορφανά foreign keys — τον πίνακα-στόχο
// που η αναφορά έπρεπε να δείχνει (μπορεί να ήταν ο ΙΔΙΟΣ που χρειαζόταν διόρθωση, π.χ. προστέθηκε
// η γραμμή που έλειπε εκεί). Το επόμενο runMigration() θα ξαναδιαβάσει ΤΟ ΤΡΕΧΟΝ (διορθωμένο) legacy
// περιεχόμενο ΜΟΝΟ για αυτούς τους πίνακες και θα το ξαναγράψει με bulkPut (idempotent — το ίδιο
// deterministic id απλά αντικαθιστά την παλιά, λανθασμένη τιμή). Πίνακες που ΔΕΝ εμπλέκονται
// παραμένουν 'done', ΔΕΝ ξαναγράφονται άσκοπα. Αν η υποκείμενη αιτία ΔΕΝ διορθώθηκε, το ΙΔΙΟ issue
// θα εμφανιστεί ξανά — ντετερμινιστική, σταθερή συμπεριφορά, όχι ατέρμων βρόχος σε όλους τους 16.
function tablesToRetryAfterVerificationFailure(verification) {
  const retry = new Set()
  for (const issue of verification.issues) {
    if (issue.type === 'missing_v2_row' || issue.type === 'orphaned_foreign_key') {
      retry.add(issue.table)
      if (issue.targetTable) retry.add(issue.targetTable)
    }
  }
  return retry
}

// Κύριο σημείο εισόδου. Idempotent/resumable: ένα ήδη ΟΛΟΚΛΗΡΩΜΕΝΟ migration επιστρέφει αμέσως
// (no-op)· ένα διακομμένο (π.χ. crash/refresh ΜΕΤΑ από μερικούς πίνακες) συνεχίζει από τον ΠΡΩΤΟ
// πίνακα που ΔΕΝ έχει status:'done' — οι ήδη 'done' πίνακες ΔΕΝ ξαναγγίζονται καθόλου.
//
// Σε αποτυχία ΟΠΟΙΟΥΔΗΠΟΤΕ πίνακα: το migration ΣΤΑΜΑΤΑΕΙ αμέσως (δεν προχωράει σε επόμενους
// πίνακες, ΑΚΟΜΑ κι αν θα ήταν ανεξάρτητοι) — η σειρά (βλ. migratedTableNames.js) ΕΓΓΥΑΤΑΙ ότι κάθε
// επόμενος πίνακας μπορεί να εξαρτάται από κάποιον προηγούμενο, άρα «προχώρα στον επόμενο ούτως ή
// άλλως» θα μπορούσε να παράγει _v2 δεδομένα με σπασμένα foreign keys. Το state παραμένει ασφαλές
// να το ξαναπροσπαθήσει κανείς αργότερα (rollback-safe — κάθε πίνακας που ΗΔΗ πέτυχε παραμένει
// 'done', κανένα partial write από τον πίνακα που απέτυχε λόγω της ατομικής transaction του).
//
// Η μεταφορά ΔΕΝ σημειώνεται complete παρά ΜΟΝΟ αν η verifyMigration() περάσει (καμία «αισιόδοξη»
// σήμανση επιτυχίας βασισμένη μόνο στο ότι δεν πέταξε καμία εξαίρεση).
//
// assertLegacyDataOwnership() καλείται ΕΔΩ, ΠΡΙΝ αγγιχτεί ΟΠΟΙΑΔΗΠΟΤΕ γραμμή — τα legacy tables δεν
// έχουν κανένα πεδίο owner (προϋπήρχαν του auth), άρα το migration ΔΕΝ μπορεί ΠΟΤΕ να υποθέσει ότι
// ανήκουν σε όποιον τυχαίνει να είναι συνδεδεμένος αυτή τη στιγμή — μια συσκευή που ξαναχρησιμοποιείται
// από άλλο λογαριασμό θα παρήγαγε _v2 δεδομένα με ΛΑΘΟΣ ιδιοκτήτη. Βλ. legacyOwnership.js: απαιτεί
// ΠΡΟΗΓΟΥΜΕΝΗ, ρητή διεκδίκηση (claimLegacyDataOwnership) — πετάει αν καμία δεν έχει γίνει ακόμα ΚΑΙ
// αν έχει γίνει από διαφορετικό χρήστη.
export async function runMigration({ getAuthenticatedUserId = defaultGetAuthenticatedUserId } = {}) {
  const userId = getAuthenticatedUserId()
  assertMigratedTablesComplete(DATA_TABLE_NAMES)
  await assertLegacyDataOwnership(userId)

  let state = await getMigrationState(userId)
  if (state.status === 'complete') return state

  if (state.status === 'not_started') {
    state = freshState(userId)
    state.startedAt = new Date().toISOString()
  }
  state.status = 'in_progress'
  state.lastError = null
  await persistState(state)

  for (const tableName of MIGRATED_TABLE_NAMES) {
    if (state.tables[tableName].status === 'done') continue

    try {
      const migratedCount = await migrateTable(userId, tableName)
      state.tables[tableName] = { status: 'done', migratedCount, error: null }
      await persistState(state)
    } catch (err) {
      const message = err?.message || 'Άγνωστο σφάλμα κατά τη μεταφορά.'
      state.tables[tableName] = { ...state.tables[tableName], status: 'failed', error: message }
      state.status = 'failed'
      state.lastError = { table: tableName, message, at: new Date().toISOString() }
      await persistState(state)
      return state
    }
  }

  state.status = 'verifying'
  await persistState(state)

  const verification = await verifyMigration(userId)
  state.verification = verification

  if (verification.status === 'passed') {
    state.status = 'complete'
    state.completedAt = new Date().toISOString()
  } else {
    state.status = 'failed'
    const retryTables = tablesToRetryAfterVerificationFailure(verification)
    for (const tableName of retryTables) {
      state.tables[tableName] = { status: 'pending', migratedCount: 0, error: null }
    }
    // retryTables ΔΕΝ είναι ποτέ άδειο εδώ — verification.status μόνο 'failed' γίνεται όταν
    // υπάρχει τουλάχιστον ένα hard failure issue, και ΚΑΘΕ hard failure issue προσθέτει πάντα
    // τουλάχιστον έναν πίνακα στο retryTables (βλ. tablesToRetryAfterVerificationFailure).
    state.lastError = {
      table: null,
      message: `Verification απέτυχε (${verification.issues.length} πρόβλημα/τα). Θα ξαναπροσπαθήσουν οι πίνακες: ${[...retryTables].join(', ')}.`,
      at: new Date().toISOString()
    }
  }
  await persistState(state)
  return state
}

// Βοηθητική ΑΠΟΚΛΕΙΣΤΙΚΑ για tests — καθαρίζει το appMeta state ΚΑΙ όλους τους _v2 πίνακες, ώστε
// κάθε test να ξεκινάει από πραγματικά καθαρή κατάσταση χωρίς να χρειάζεται να ξέρει τις λεπτομέρειες
// του state shape. ΔΕΝ εξάγεται/χρησιμοποιείται από κανένα production code path.
export async function resetMigrationForTests() {
  await db.appMeta.delete(STATE_KEY)
  await resetLegacyOwnershipForTests()
  for (const tableName of MIGRATED_TABLE_NAMES) {
    await db.table(v2TableName(tableName)).clear()
  }
}
