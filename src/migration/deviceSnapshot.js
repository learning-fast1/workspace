import Dexie from 'dexie'
import db from '../db.js'
import { MIGRATED_TABLE_NAMES, v2TableName } from './migratedTableNames.js'

// Sprint 5A Phase 2, Commit 6 — στιγμιότυπο ΟΛΟΚΛΗΡΗΣ της συσκευής: ΚΑΙ οι δύο γενιές (legacy +
// _v2), ΟΛΕΣ οι γραμμές appMeta (ownership/migration state/active generation/restore finalization/
// persisted safety backups/ό,τι άλλο υπάρχει — ΧΩΡΙΣ να χρειάζεται να απαριθμηθεί ρητά κάθε κλειδί).
// ΞΕΧΩΡΙΣΤΟ από utils/backup.js (Commit 5): εκείνο είναι generation-aware, εξάγει ΜΟΝΟ την ενεργή
// γενιά κάτω από κανονικά ονόματα — ΓΙΑ χρήση από τον χρήστη (κατέβασμα/επαναφορά αρχείου). Αυτό
// εδώ είναι ωμό, byte-for-byte στιγμιότυπο ΚΑΙ των δύο γενιών ΜΑΖΙ — ΓΙΑ εσωτερική χρήση από
// auth/signOut.js, ώστε να αναιρείται με ακρίβεια η καταστροφική επίδραση του db.cloud.logout()
// (βλ. εκεί) χωρίς καμία επανερμηνεία/migration-εκ-νέου των δεδομένων.
export async function captureFullDeviceSnapshot() {
  const data = {}
  for (const table of MIGRATED_TABLE_NAMES) {
    data[table] = await db.table(table).toArray()
    data[v2TableName(table)] = await db.table(v2TableName(table)).toArray()
  }
  const appMetaRows = await db.appMeta.toArray()
  return { capturedAt: new Date().toISOString(), data, appMetaRows }
}

// Καθαρίζει ΠΡΩΤΑ (idempotent — ασφαλές να κληθεί ανεξάρτητα από το αν οι πίνακες είναι ήδη άδειοι,
// π.χ. αμέσως μετά το db.cloud.logout() που ήδη τους άδειασε) και μετά ξαναγράφει ΑΚΡΙΒΩΣ ό,τι είχε
// καταγραφεί — ίδιο bulkPut idiom με utils/backup.js ώστε να διατηρούνται τα αρχικά id.
export async function restoreFullDeviceSnapshot(snapshot) {
  const allTables = [
    ...MIGRATED_TABLE_NAMES.flatMap((table) => [db.table(table), db.table(v2TableName(table))]),
    db.appMeta
  ]
  await db.transaction('rw', allTables, async () => {
    for (const table of MIGRATED_TABLE_NAMES) {
      await db.table(table).clear()
      await db.table(v2TableName(table)).clear()
      const legacyRows = snapshot.data[table]
      if (Array.isArray(legacyRows) && legacyRows.length > 0) await db.table(table).bulkPut(legacyRows)
      const v2Rows = snapshot.data[v2TableName(table)]
      if (Array.isArray(v2Rows) && v2Rows.length > 0) await db.table(v2TableName(table)).bulkPut(v2Rows)
    }
    await db.appMeta.clear()
    if (Array.isArray(snapshot.appMetaRows) && snapshot.appMetaRows.length > 0) {
      await db.appMeta.bulkPut(snapshot.appMetaRows)
    }
  })
}

// Review, μετά την πρώτη έγκριση — μετρήθηκε (ΟΧΙ εκτιμήθηκε, βλ. deviceSnapshot.test.js
// «Μέτρηση μεγέθους») το χειρότερο ρεαλιστικό μέγεθος ενός στιγμιότυπου: ένας βετεράνος
// εκπαιδευτικός με 150 μαθητές/12 χρόνια ιστορικού ΚΑΙ τις δύο γενιές γεμάτες (Commit 5/6: «Do not
// delete either generation» σημαίνει ότι αυτό ΘΑ συμβεί με τον χρόνο) παράγει ~36MB serialized —
// 7x πάνω από το πιο συντηρητικό κοινό όριο localStorage (~5MB/origin). Το localStorage είναι
// ΛΑΘΟΣ μηχανισμός για αυτό το στιγμιότυπο συγκεκριμένα (παραμένει σωστό, ΑΝΑΛΛΟΙΩΤΟ, για το
// μικροσκοπικό sync-authorization hint — βλ. syncAuthorizationHint.js — ΕΚΕΙ χρειάζεται συγχρονική,
// pre-open ανάγνωση, που το IndexedDB δεν μπορεί ποτέ να προσφέρει).
//
// Λύση: ΞΕΧΩΡΙΣΤΗ, αυτόνομη IndexedDB βάση (ΟΧΙ το ίδιο 'workspace' instance) — το db.cloud.logout()
// καθαρίζει ΜΟΝΟ τους πίνακες ΤΗΣ ΙΔΙΑΣ Dexie/IndexedDB βάσης στην οποία τρέχει (βλ. auth/signOut.js
// review), άρα μια εντελώς διαφορετική βάση ΠΟΤΕ δεν αγγίζεται από αυτή την πλευρική ενέργεια — ΔΕΝ
// χρειάζεται καν το try/finally πρόβλημα ενός shared namespace. Η χωρητικότητα του IndexedDB (τυπικά
// εκατοντάδες MB έως αρκετά GB, ποσοστό ελεύθερου χώρου δίσκου) είναι δύο-τρεις τάξεις μεγέθους πάνω
// από το localStorage — άνετα αρκετή για αυτό το μέγεθος δεδομένων.
const safetyDb = new Dexie('workspace-signout-safety')
safetyDb.version(1).stores({ snapshots: 'key' })

const PENDING_SNAPSHOT_KEY = 'pending'

export async function persistPendingSnapshot(snapshot) {
  await safetyDb.snapshots.put({ key: PENDING_SNAPSHOT_KEY, snapshot, savedAt: new Date().toISOString() })
}

export async function readPendingSnapshot() {
  const row = await safetyDb.snapshots.get(PENDING_SNAPSHOT_KEY)
  return row?.snapshot || null
}

export async function clearPendingSnapshot() {
  await safetyDb.snapshots.delete(PENDING_SNAPSHOT_KEY)
}
