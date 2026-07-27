import { MIGRATED_TABLE_NAMES, v2TableName } from './migratedTableNames.js'

// Sprint 5A Phase 2, Commit 6 — ΣΚΟΠΙΜΑ σε δικό του, χωρίς εξάρτηση από db.js module: το db.js
// ΧΡΕΙΑΖΕΤΑΙ να διαβάσει το hint ΣΥΓΧΡΟΝΑ, ΠΡΙΝ από db.cloud.configure()/db.open() — βλ. review,
// evidence-based εύρημα: το dexie-cloud-addon (updateSchemaFromOptions) γράφει markedForSync ΜΟΝΟ
// true→false, ΠΟΤΕ false→true, μέσα σε ΜΙΑ σελίδα-φόρτωση — άρα η ΠΡΩΤΗ (πριν το open) κλήση
// configure() ΕΙΝΑΙ η ΜΟΝΑΔΙΚΗ που μπορεί ποτέ να επιτρέψει sync στους _v2 πίνακες αυτής της
// φόρτωσης· οτιδήποτε χρειάζεται να διαβαστεί appMeta (π.χ. checkSyncPrerequisites στο
// syncAuthorization.js) απαιτεί ήδη db.open(), άρα είναι ΑΡΓΑ για αυτή τη συγκεκριμένη κλήση. Το
// localStorage είναι το ΜΟΝΟ συγχρονικά διαθέσιμο, ΠΡΙΝ από db.open(), σημείο αποθήκευσης.
//
// ΡΗΤΑ «μη έμπιστο» (review, verbatim) — απλά ένα ΥΠΟΨΗΦΙΟ userId, ΠΟΤΕ πηγή αλήθειας από μόνο
// του. Η ΜΟΝΑΔΙΚΗ του δουλειά είναι να αποφασίσει ΠΟΙΑ λίστα unsyncedTables θα περάσει η ΠΡΩΤΗ
// configure() αυτής της φόρτωσης — ΑΜΕΣΩΣ μετά το db.open(), το syncAuthorization.js το
// ΕΠΑΝΕΠΙΒΕΒΑΙΩΝΕΙ ολόκληρο, ρητά, πάνω στα πραγματικά appMeta/currentUser, και το ΑΝΑΙΡΕΙ αμέσως
// (configure ξανά με την πλήρη λίστα — η φορά ΠΟΥ δουλεύει πάντα, βλ. ίδιο review) αν δεν ταιριάζει.
const HINT_KEY = 'workspace.phase2SyncAuthorizedUserId'

const V2_TABLE_NAMES = new Set(MIGRATED_TABLE_NAMES.map(v2TableName))

function getLocalStorageOrNull() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

// null = «κανένα hint» — ΠΑΝΤΑ ερμηνεύεται ως μη-εξουσιοδοτημένο (fail-closed). ΡΗΤΑ ελέγχει ότι η
// τιμή είναι μη-κενό string (review, verbatim: «Store a non-empty userId, never only a boolean»)
// — οτιδήποτε άλλο (κενό string, malformed) αγνοείται ως να μην υπήρχε καθόλου.
export function readSyncAuthorizationHint() {
  const storage = getLocalStorageOrNull()
  if (!storage) return null
  const value = storage.getItem(HINT_KEY)
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function writeSyncAuthorizationHint(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new Error('writeSyncAuthorizationHint: απαιτείται μη κενό userId string.')
  }
  const storage = getLocalStorageOrNull()
  if (!storage) {
    throw new Error('writeSyncAuthorizationHint: το localStorage δεν είναι διαθέσιμο σε αυτό το περιβάλλον.')
  }
  storage.setItem(HINT_KEY, userId)
}

export function clearSyncAuthorizationHint() {
  const storage = getLocalStorageOrNull()
  if (!storage) return
  storage.removeItem(HINT_KEY)
}

const ADDON_TABLES = new Set(['realms', 'members', 'roles'])
const isAddonTable = (name) => name.startsWith('$') || ADDON_TABLES.has(name)

export function computeUnsyncedTables({ hint, allTableNames }) {
  // hint απόν → η ΠΛΗΡΗΣ λίστα, ΚΥΡΙΟΛΕΚΤΙΚΑ τίποτα δεν συγχρονίζεται — ΟΥΤΕ καν η υποδομή του ίδιου
  // του addon (realms/members/roles/$...). Η ασυμμετρία με τον παρακάτω κλάδο είναι ΣΚΟΠΙΜΗ, όχι
  // παράλειψη: η εγγύηση του Phase 1 («καμία εξουσιοδότηση → μηδενικό sync») παραμένει απόλυτη,
  // χωρίς εξαίρεση ούτε για «αθώους» πίνακες υποδομής — δεν αλλάζει ως παρενέργεια διόρθωσης bug
  // (review, βλ. db.test.js #3/#4, ρητά διατηρημένα ανέγγιχτα).
  if (!hint) return allTableNames

  // hint παρόν — real-device εύρημα (καθαρή συσκευή: $baseRevs άδειο, καμία λήψη ΠΟΤΕ δεν
  // ολοκληρώθηκε ΜΕΤΑ την εξουσιοδότηση): το allTableNames περιλαμβάνει ΚΑΙ τους εσωτερικούς
  // πίνακες του dexie-cloud-addon (realms, members, roles, $logins, $baseRevs, $syncState, $jobs,
  // $*_mutations). Αυτοί ΔΕΝ είναι εκπαιδευτικά δεδομένα προς προστασία — χωρίς αυτούς ο client δεν
  // χτίζει ποτέ τη σωστή εικόνα realm/access του, άρα καμία λήψη δεν ολοκληρώνεται. Εξαιρούνται
  // λοιπόν ΕΔΩ, ΜΟΝΟ αφού υπάρχει ρητό hint — μαζί με τους 16 _v2 πίνακες (legacy + appMeta
  // παραμένουν πάντα εκτός, αντλείται από allTableNames όχι από καρφωμένη λίστα).
  return allTableNames.filter((name) => !isAddonTable(name) && !V2_TABLE_NAMES.has(name))
}
