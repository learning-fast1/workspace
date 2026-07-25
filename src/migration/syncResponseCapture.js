// ΠΡΟΣΩΡΙΝΟ, ΑΜΙΓΩΣ ΔΙΑΓΝΩΣΤΙΚΟ module — real-device multi-device sync validation (Sprint 5A Phase 2):
// αποδεικνύει αν το ΠΡΑΓΜΑΤΙΚΟ sync response από τον server περιέχει τις εγγραφές students_v2 μιας
// συσκευής, και αν επιβιώνουν μέχρι το applyServerChanges (dexie-cloud-addon.js) που τις γράφει στο
// IndexedDB. ΔΕΝ αλλάζει ΚΑΜΙΑ συμπεριφορά sync — το ίδιο το dexie-cloud-addon ΗΔΗ κάνει
// console.debug('Sync request', ...) / ('Sync response', ...) / ('Applying server changes', ...)
// ΑΝΕΥ ΟΡΩΝ (επιβεβαιωμένο στο εγκατεστημένο source, γραμμές 3906/5034/4068) — εδώ ΜΟΝΟ
// παρακολουθούμε αυτές τις ΗΔΗ υπάρχουσες κλήσεις, καλώντας ΠΑΝΤΑ πρώτα το πραγματικό console.debug.
// Καμία εγγραφή περιεχομένου μαθητή (values/changeSpec) δεν αποθηκεύεται ΠΟΤΕ — μόνο table/type/keys.
const ARM_KEY = 'workspace.diagSyncCaptureArmed'
const WATCHED_LABELS = new Set(['Sync request', 'Sync response', 'Applying server changes'])
const MAX_EVENTS = 50

let installed = false
const events = []

function getLocalStorageOrNull() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function isCaptureArmed() {
  const storage = getLocalStorageOrNull()
  return storage ? storage.getItem(ARM_KEY) === '1' : false
}

export function armCapture() {
  getLocalStorageOrNull()?.setItem(ARM_KEY, '1')
}

export function disarmCapture() {
  getLocalStorageOrNull()?.removeItem(ARM_KEY)
}

// {table, muts:[{type, keys, ...}]} → {table, muts:[{type, keys}]}. Αφαιρεί ΠΑΝΤΑ values/changeSpec.
function redactChangeSet(changeSet) {
  if (!Array.isArray(changeSet)) return null
  return changeSet.map((entry) => ({
    table: entry?.table ?? null,
    muts: Array.isArray(entry?.muts)
      ? entry.muts.map((mut) => ({ type: mut?.type ?? null, keys: mut?.keys ?? null }))
      : null
  }))
}

function redactPayload(label, payload) {
  try {
    if (label === 'Sync request') {
      return {
        lastPull: payload?.lastPull ?? null,
        changesSummary: Array.isArray(payload?.changes)
          ? payload.changes.map((c) => ({ table: c?.table ?? null, mutCount: c?.muts?.length ?? 0 }))
          : null
      }
    }
    if (label === 'Sync response') {
      return {
        serverRevision: payload?.serverRevision ?? null,
        dbId: payload?.dbId ?? null,
        realms: payload?.realms ?? null,
        inviteRealms: payload?.inviteRealms ?? null,
        changes: redactChangeSet(payload?.changes)
      }
    }
    if (label === 'Applying server changes') {
      // Το δεύτερο όρισμα εδώ (Dexie.currentTransaction) ΔΕΝ αγγίζεται/serialized καθόλου.
      return { changes: redactChangeSet(payload) }
    }
    return null
  } catch (err) {
    return { redactionError: `${err?.name || 'Error'}: ${err?.message || String(err)}` }
  }
}

export function installConsoleCapture() {
  if (installed) return
  installed = true
  const originalDebug = console.debug ? console.debug.bind(console) : () => {}
  console.debug = (...args) => {
    originalDebug(...args)
    const [label, payload] = args
    if (WATCHED_LABELS.has(label)) {
      events.push({ ts: new Date().toISOString(), label, ...redactPayload(label, payload) })
      if (events.length > MAX_EVENTS) events.shift()
    }
  }
}

export function getCapturedEvents() {
  return events
}

// Test-only — ίδιο idiom με resetSessionSyncForTests.
export function resetSyncResponseCaptureForTests() {
  installed = false
  events.length = 0
}
