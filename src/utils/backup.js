import db, {
  setLastBackupAt, ensureDomainTemplatesSeeded,
  migrateRevisedGoalStatusToActive, backfillGoalEvents
} from '../db.js'
import {
  getCachedGeneration, currentUserIdOrNull,
  activateV2Generation, setActiveGenerationForRestoredV2,
  forceLegacyGenerationForRestore, setRestoreFinalizationState
} from '../migration/activeGeneration.js'
import { MIGRATED_TABLE_NAMES, v2TableName } from '../migration/migratedTableNames.js'
import { getLegacyDataOwner, claimLegacyDataOwnership } from '../migration/legacyOwnership.js'
import { runMigration, resetMigrationStateForUser } from '../migration/migrationEngine.js'
import { todayLocalISO } from './date.js'

// appMeta.value: το ίδιο payload που θα επέστρεφε buildBackupPayload(), γραμμένο ΠΡΙΝ ξεκινήσει η
// καταστροφική transaction ενός restore — βλ. restoreFromBackup παρακάτω.
const SAFETY_BACKUP_KEY = 'phase2LastPreRestoreSafetyBackup'

// Sprint 5A Phase 2, Commit 5 — το backup ΠΛΕΟΝ είναι generation-aware: εξάγει ΜΟΝΟ τους 16
// εκπαιδευτικούς πίνακες της ΤΡΕΧΟΥΣΑΣ ενεργής γενιάς (legacy ΕΙΤΕ _v2), κάτω από ΚΑΝΟΝΙΚΑ (χωρίς
// «_v2» επίθημα) ονόματα κλειδιών — το «generation» πεδίο δηλώνει ρητά ποια γενιά αντιπροσωπεύουν.
// Το appMeta ΠΟΤΕ δεν συμπεριλαμβάνεται εδώ (μεταδεδομένα συσκευής, όχι εκπαιδευτικά δεδομένα).
export async function buildBackupPayload() {
  const generation = getCachedGeneration()
  const data = {}
  for (const table of MIGRATED_TABLE_NAMES) {
    const tableName = generation === 'v2' ? v2TableName(table) : table
    data[table] = await db.table(tableName).toArray()
  }
  const owner = await getLegacyDataOwner()
  return {
    app: 'workspace',
    dbVersion: db.verno,
    exportedAt: new Date().toISOString(),
    generation,
    ownership: owner ? { userId: owner.userId } : null,
    data
  }
}

// Κατεβάζει το JSON ως αρχείο και καταγράφει την ώρα του backup.
export async function exportBackupFile() {
  const payload = await buildBackupPayload()
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const filename = `workspace-backup-${todayLocalISO()}.json`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  await setLastBackupAt(payload.exportedAt)
  return {
    filename,
    generation: payload.generation,
    counts: Object.fromEntries(MIGRATED_TABLE_NAMES.map((t) => [t, payload.data[t].length]))
  }
}

// Ελέγχει ότι ένα parsed JSON αντικείμενο μοιάζει με έγκυρο αντίγραφο ασφαλείας του Workspace.
//
// «generation»: fail-closed ΜΟΝΟ πάνω στο ίδιο το πεδίο (review, verbatim) — λείπει → 'legacy'
// (παλιά backups, πριν από αυτό το commit)· 'legacy'/'v2' → έγκυρο· ΟΤΙΔΗΠΟΤΕ άλλο → σφάλμα. Η
// τυχόν απαίτηση «το v2 backup ΠΡΕΠΕΙ να έχει ownership για να αποκατασταθεί» είναι ΞΕΧΩΡΙΣΤΟΣ
// κανόνας ασφάλειας επαναφοράς (βλ. assertRestoreOwnershipSafe παρακάτω) — ΔΕΝ αναμιγνύεται εδώ,
// ώστε μια απλή προεπισκόπηση αρχείου (Settings.jsx, πριν καν πατηθεί «Επαναφορά») να δείχνει
// σωστά μετρήσεις/γενιά ακόμα και για ένα έγκυρο v2 backup που (ασυνήθιστα) δεν έχει ownership.
export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Το αρχείο δεν είναι έγκυρο JSON αντικείμενο.' }
  }
  if (payload.app !== 'workspace') {
    return { valid: false, error: 'Το αρχείο δεν μοιάζει με αντίγραφο ασφαλείας του Workspace.' }
  }
  if (!payload.data || typeof payload.data !== 'object') {
    return { valid: false, error: 'Λείπουν τα δεδομένα («data») από το αρχείο.' }
  }

  let generation = 'legacy'
  if (payload.generation !== undefined) {
    if (payload.generation !== 'legacy' && payload.generation !== 'v2') {
      return { valid: false, error: `Άγνωστη γενιά δεδομένων («generation»): ${JSON.stringify(payload.generation)}` }
    }
    generation = payload.generation
  }

  const counts = {}
  for (const table of MIGRATED_TABLE_NAMES) {
    const rows = payload.data[table]
    if (rows !== undefined && !Array.isArray(rows)) {
      return { valid: false, error: `Το πεδίο «${table}» του αρχείου δεν είναι λίστα.` }
    }
    counts[table] = Array.isArray(rows) ? rows.length : 0
  }

  const ownership = payload.ownership && typeof payload.ownership.userId === 'string' && payload.ownership.userId.trim() !== ''
    ? { userId: payload.ownership.userId }
    : null

  return { valid: true, counts, generation, ownership }
}

// Λογαριασμός-ασφάλεια πριν αγγιχτεί ΟΠΟΙΑΔΗΠΟΤΕ γραμμή (review, verbatim: «fail before clearing
// anything if ownership cannot be established»). Τρεις ανεξάρτητοι λόγοι αποτυχίας:
// 1) v2 backup ΧΩΡΙΣ ownership — δεν μπορεί ΠΟΤΕ να αποδοθεί με ασφάλεια σε κανέναν χρήστη.
// 2) η συσκευή ανήκει ήδη (legacyDataOwner) σε ΔΙΑΦΟΡΕΤΙΚΟ λογαριασμό από το ownership του backup.
// 3) ο ΤΡΕΧΩΝ συνδεδεμένος χρήστης είναι διαφορετικός από το ownership του backup — ποτέ επαναφορά
//    του backup ενός χρήστη κάτω από διαφορετικό authenticated λογαριασμό.
// Για ΠΑΛΙΑ backups χωρίς ownership: ανεκτά ΜΟΝΟ αν δεν υπάρχει ήδη γνωστός ιδιοκτήτης συσκευής
// διαφορετικός από τον τρέχοντα συνδεδεμένο χρήστη — καμία σιωπηλή κληρονομιά σε λάθος λογαριασμό.
//
// getCurrentUserId: ΙΔΙΟ idiom/όνομα-παραμέτρου («getAuthenticatedUserId») με claimLegacyDataOwnership/
// runMigration/activateV2Generation, ώστε ο ίδιος καλών (restoreFromBackup) να περνάει ΕΝΑ κοινό
// override παντού — προεπιλογή currentUserIdOrNull (ο πραγματικός db.cloud χρήστης).
async function assertRestoreOwnershipSafe(generation, ownership, getCurrentUserId) {
  if (generation === 'v2' && !ownership) {
    throw new Error(
      'Ένα αντίγραφο ασφαλείας v2 χωρίς στοιχεία ιδιοκτησίας («ownership») δεν μπορεί να αποκατασταθεί ' +
      'με ασφάλεια — δεν είναι δυνατή η επιβεβαίωση σε ποιον χρήστη ανήκουν τα δεδομένα.'
    )
  }

  const deviceOwner = await getLegacyDataOwner()
  const currentUserId = getCurrentUserId()

  if (ownership) {
    if (deviceOwner && deviceOwner.userId !== ownership.userId) {
      throw new Error(
        'Τα τοπικά δεδομένα αυτής της συσκευής ανήκουν ήδη σε άλλο λογαριασμό — η επαναφορά ενός ' +
        'αντιγράφου ασφαλείας διαφορετικού ιδιοκτήτη σε αυτή τη συσκευή δεν επιτρέπεται.'
      )
    }
    if (currentUserId && currentUserId !== ownership.userId) {
      throw new Error(
        'Το αντίγραφο ασφαλείας ανήκει σε διαφορετικό λογαριασμό από τον τρέχοντα συνδεδεμένο χρήστη — ' +
        'η επαναφορά αρνείται να προχωρήσει.'
      )
    }
    return
  }

  if (deviceOwner && currentUserId && deviceOwner.userId !== currentUserId) {
    throw new Error(
      'Τα τοπικά δεδομένα αυτής της συσκευής ανήκουν ήδη σε άλλο λογαριασμό από τον τρέχοντα ' +
      'συνδεδεμένο χρήστη — η επαναφορά ενός παλιού αντιγράφου χωρίς στοιχεία ιδιοκτησίας αρνείται ' +
      'να προχωρήσει.'
    )
  }
}

// Legacy backup restore: μετά την (ήδη ολοκληρωμένη, ατομική) επαναφορά των legacy πινάκων, ρυθμίζει
// ξανά ό,τι έχει να κάνει με ιδιοκτησία/migration/ενεργή γενιά.
//
// Review (3η αναθεώρηση — δεύτερο, στενότερο κενό εντοπίστηκε): η 2η αναθεώρηση έκανε το
// forceLegacyGenerationForRestore() πρώτο, ΑΝΕΥ ΟΡΩΝ (σωστό) — αλλά η ΠΡΩΤΗ εγγραφή
// setRestoreFinalizationState('pending') παρέμενε ΕΚΤΟΣ try, όπως και η ΤΕΛΙΚΗ εγγραφή στο τέλος
// της συνάρτησης· αν οποιαδήποτε από τις δύο πετούσε (ή αν κάποιο από τα reads ιδιοκτησίας/γενιάς
// πετούσε πριν προλάβει να μπει στο try), το σφάλμα θα διέφευγε ΞΑΝΑ ανεξέλεγκτο προς τα έξω.
//
// Διόρθωση: ΑΠΟΛΥΤΩΣ ΚΑΘΕ πράξη μετά το forceLegacyGenerationForRestore() — η αρχική 'pending'
// εγγραφή, τα reads ιδιοκτησίας, το claim/migrate/activate, ΚΑΙ η τελική εγγραφή — είναι τώρα μέσα
// σε try/catch (η τελική εγγραφή στο δικό της, ξεχωριστό try/catch, ώστε μια αποτυχία ΕΚΕΙ να μην
// ξαναπετάξει). Η ΜΟΝΗ γραμμή σε ΟΛΗ τη συνάρτηση που μπορεί να πετάξει ανεξέλεγκτα είναι το ίδιο
// το forceLegacyGenerationForRestore() — και αυτό είναι αναπόφευκτο εκ κατασκευής: η επιτυχία
// ΑΚΡΙΒΩΣ αυτής της πράξης ΕΙΝΑΙ η ίδια η εγγύηση δρομολόγησης που ζητήθηκε· αν αυτή η ΜΙΑ, πρώτη,
// φθηνή εγγραφή αποτύχει (μόνο σε πραγματική βλάβη IndexedDB — το ΙΔΙΟ επίπεδο βλάβης θα έθετε ήδη
// σε κίνδυνο ΚΑΘΕ άλλη εγγραφή αυτού του συστήματος, συμπεριλαμβανομένης της ίδιας της transaction
// αποκατάστασης δεδομένων που μόλις έκανε commit), τότε ο δείκτης/cache παραμένουν ΑΠΛΑ ό,τι ήταν
// πριν (καμία αλλαγή, καμία διαφθορά) — δεν υπάρχει τρόπος να γίνει μια εγγραφή «πιο αξιόπιστη» από
// την ίδια τη βάση στην οποία γράφεται.
//
// ΠΡΟΣΟΧΗ (bug βρέθηκε ΚΑΤΑ τη σύνταξη αυτής της αναθεώρησης, διορθώθηκε πριν σταλεί): το
// wasAlreadyV2 ΠΡΕΠΕΙ να διαβαστεί ΠΡΙΝ το forceLegacyGenerationForRestore() σβήσει το marker —
// αλλιώς η getActiveGeneration() θα έβλεπε ΠΑΝΤΑ «καμία εγγραφή» και θα επέστρεφε πάντα false,
// σπάζοντας σιωπηλά την επανενεργοποίηση v2. Λύση: cachedGeneration (μέσω getCachedGeneration())
// διαβάζεται ΣΥΓΧΡΟΝΑ, ΠΡΙΝ από ΟΠΟΙΑΔΗΠΟΤΕ async πράξη — καμία εξάρτηση από appMeta, άρα ΔΕΝ
// μπορεί ούτε να πετάξει ούτε να «δει» ένα ήδη σβησμένο marker. Αντικατοπτρίζει επίσης πιστότερα
// αυτό που πραγματικά ρωτάμε («δρομολογούσε ήδη η ΙΔΙΑ η εφαρμογή σε v2 ΤΩΡΑ»), όχι μια ξεχωριστή
// επανάληψη ανάγνωσης από το appMeta για συγκεκριμένο userId.
async function finalizeLegacyRestore(ownership, getCurrentUserId) {
  const wasAlreadyV2 = getCachedGeneration() === 'v2'
  const targetGeneration = wasAlreadyV2 ? 'v2' : 'legacy'

  await forceLegacyGenerationForRestore()

  const startedAt = new Date().toISOString()
  let userId = null
  let migrationState = null
  let finalization = { userId: null, targetGeneration, status: 'pending', startedAt, completedAt: null, error: null }

  try {
    await setRestoreFinalizationState(finalization)

    const deviceOwner = await getLegacyDataOwner()
    userId = ownership?.userId || deviceOwner?.userId || getCurrentUserId()
    finalization = { ...finalization, userId }
    if (!userId) {
      finalization = { ...finalization, status: 'complete', completedAt: new Date().toISOString() }
      await setRestoreFinalizationState(finalization)
      return { userId: null, migrationState: null, finalization }
    }

    const claimOpts = { getAuthenticatedUserId: getCurrentUserId }
    await claimLegacyDataOwnership(userId, claimOpts)
    await resetMigrationStateForUser(userId)
    migrationState = await runMigration(claimOpts)
    if (migrationState.status !== 'complete') {
      throw new Error(`Το migration μετά την επαναφορά δεν ολοκληρώθηκε (κατάσταση: ${migrationState.status}).`)
    }
    if (targetGeneration === 'v2') {
      await activateV2Generation(userId, claimOpts)
    }
    finalization = { ...finalization, status: 'complete', completedAt: new Date().toISOString() }
  } catch (err) {
    finalization = {
      ...finalization, userId, status: 'failed', completedAt: new Date().toISOString(),
      error: err?.message || 'Άγνωστο σφάλμα κατά την ολοκλήρωση της επαναφοράς.'
    }
  }

  try {
    await setRestoreFinalizationState(finalization)
  } catch {
    // Το appMeta ήδη δείχνει legacy (forceLegacyGenerationForRestore πιο πάνω ήδη πέτυχε πριν καν
    // φτάσουμε εδώ) — αν αποτύχει ΚΑΙ αυτή η τελική audit-εγγραφή, η ασφάλεια δρομολόγησης παραμένει
    // άθικτη· απλά δεν υπάρχει επιπλέον καταγεγραμμένο ίχνος για αυτή τη συγκεκριμένη προσπάθεια.
  }

  return { userId, migrationState, finalization }
}

// v2 backup restore: το ownership είναι ΕΓΓΥΗΜΕΝΑ μη-null εδώ (assertRestoreOwnershipSafe το
// απαιτεί πριν καν ξεκινήσει η καταστροφική εγγραφή) — καμία επανάληψη αυτού του ελέγχου.
async function restoreV2OwnershipAndMarker(ownership) {
  await setActiveGenerationForRestoredV2(ownership.userId)
  return ownership.userId
}

// Επιστρέφει το πιο πρόσφατο αυτόματο αντίγραφο ασφαλείας που γράφτηκε ΠΡΙΝ από ένα restore
// (βλ. restoreFromBackup) — null αν δεν έχει γίνει ποτέ restore σε αυτή τη συσκευή.
export async function getLastPreRestoreSafetyBackup() {
  const row = await db.appMeta.get(SAFETY_BACKUP_KEY)
  return row?.value || null
}

// Αντικαθιστά τα δεδομένα ΜΟΝΟ της γενιάς που δηλώνει το backup, μέσα σε μία συναλλαγή (όλα ή
// τίποτα) — ΚΑΙ ΟΙ ΔΥΟ γενιές καθαρίζονται πρώτα (review, verbatim: καμία γραμμή μετά το backup να
// μην επιβιώσει αθόρυβα), μετά γράφεται ΜΟΝΟ η γενιά-στόχος.
//
// Πριν από αυτό: επαληθεύεται η ιδιοκτησία (assertRestoreOwnershipSafe, πριν αγγιχτεί οτιδήποτε),
// ΚΑΙ λαμβάνεται/γράφεται ΜΟΝΙΜΑ ένα αντίγραφο ασφαλείας της ΤΡΕΧΟΥΣΑΣ κατάστασης στο appMeta
// (SAFETY_BACKUP_KEY — review: αν βασιζόταν ΜΟΝΟ στην in-memory επιστρεφόμενη τιμή, ένα crash του
// browser ΜΕΤΑ το commit της παρακάτω transaction αλλά ΠΡΙΝ ο καλών προλάβει να την αποθηκεύσει θα
// έχανε ΟΡΙΣΤΙΚΑ το προηγούμενο στιγμιότυπο. Γράφοντάς το ΕΔΩ, ΠΡΙΝ ξεκινήσει η ίδια η καταστροφική
// transaction, το στιγμιότυπο είναι ήδη ασφαλές στο IndexedDB πολύ πριν καν αρχίσει ο,τιδήποτε
// καταστροφικό — ανεξάρτητο από το αν ο καλών προλαβαίνει να κάνει οτιδήποτε με την επιστρεφόμενη
// τιμή). Χρησιμοποιεί bulkPut (όχι bulkAdd) ώστε να διατηρηθούν τα αρχικά id.
export async function restoreFromBackup(payload, { getAuthenticatedUserId = currentUserIdOrNull } = {}) {
  const validation = validateBackupPayload(payload)
  if (!validation.valid) throw new Error(validation.error)
  const { generation, ownership } = validation

  await assertRestoreOwnershipSafe(generation, ownership, getAuthenticatedUserId)

  const safetyBackup = await buildBackupPayload()
  await db.appMeta.put({ key: SAFETY_BACKUP_KEY, value: safetyBackup })

  const allTables = MIGRATED_TABLE_NAMES.flatMap((table) => [db.table(table), db.table(v2TableName(table))])
  await db.transaction('rw', allTables, async () => {
    for (const table of MIGRATED_TABLE_NAMES) {
      await db.table(table).clear()
      await db.table(v2TableName(table)).clear()
    }

    for (const table of MIGRATED_TABLE_NAMES) {
      const rows = payload.data[table]
      if (Array.isArray(rows) && rows.length > 0) {
        const targetTable = generation === 'v2' ? v2TableName(table) : table
        await db.table(targetTable).bulkPut(rows)
      }
    }

    // Ίδιο σκεπτικό με πριν (ambient-transaction participation) — ΜΟΝΟ για legacy, αφού αυτοί οι
    // δύο βοηθοί δουλεύουν ρητά πάνω στα legacy db.goals/db.goalEvents.
    if (generation === 'legacy') {
      await migrateRevisedGoalStatusToActive()
      await backfillGoalEvents()
    }
  })

  let finalUserId = null
  let migrationState = null
  let finalization = null
  if (generation === 'legacy') {
    const result = await finalizeLegacyRestore(ownership, getAuthenticatedUserId)
    finalUserId = result.userId
    migrationState = result.migrationState
    finalization = result.finalization
  } else {
    finalUserId = await restoreV2OwnershipAndMarker(ownership)
  }

  // Αν το backup δεν είχε (ή είχε άδειο) domainTemplates, ξαναγεμίζει με τα προεπιλεγμένα seed
  // δεδομένα — αλλιώς οι προτάσεις τομέων θα έμεναν μόνιμα άδειες μετά την επαναφορά.
  await ensureDomainTemplatesSeeded(finalUserId ? { getUserId: () => finalUserId } : undefined)
  await setLastBackupAt(new Date().toISOString())

  return { generation, safetyBackup, migrationState, finalization }
}
