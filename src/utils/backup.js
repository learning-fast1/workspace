import db, { DATA_TABLE_NAMES, setLastBackupAt, ensureDomainTemplatesSeeded } from '../db.js'
import { todayLocalISO } from './date.js'

// Πλήρες στιγμιότυπο όλων των πινάκων δεδομένων (όχι appMeta — αυτό είναι μεταδεδομένα συσκευής).
export async function buildBackupPayload() {
  const data = {}
  for (const table of DATA_TABLE_NAMES) {
    data[table] = await db[table].toArray()
  }
  return {
    app: 'workspace',
    dbVersion: db.verno,
    exportedAt: new Date().toISOString(),
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
  return { filename, counts: Object.fromEntries(DATA_TABLE_NAMES.map((t) => [t, payload.data[t].length])) }
}

// Ελέγχει ότι ένα parsed JSON αντικείμενο μοιάζει με έγκυρο αντίγραφο ασφαλείας του Workspace.
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

  const counts = {}
  for (const table of DATA_TABLE_NAMES) {
    const rows = payload.data[table]
    if (rows !== undefined && !Array.isArray(rows)) {
      return { valid: false, error: `Το πεδίο «${table}» του αρχείου δεν είναι λίστα.` }
    }
    counts[table] = Array.isArray(rows) ? rows.length : 0
  }
  return { valid: true, counts }
}

// Αντικαθιστά ΟΛΑ τα δεδομένα με αυτά του backup, μέσα σε μία συναλλαγή (όλα ή τίποτα).
// Χρησιμοποιεί bulkPut (όχι bulkAdd) ώστε να διατηρηθούν τα αρχικά id — αλλιώς σπάνε οι
// αναφορές μεταξύ πινάκων (π.χ. measurements.sessionId, measurements.goalId).
export async function restoreFromBackup(payload) {
  const tables = DATA_TABLE_NAMES.map((name) => db[name])
  await db.transaction('rw', tables, async () => {
    for (const table of DATA_TABLE_NAMES) {
      await db[table].clear()
      const rows = payload.data[table]
      if (Array.isArray(rows) && rows.length > 0) {
        await db[table].bulkPut(rows)
      }
    }
  })
  // Αν το backup δεν είχε (ή είχε άδειο) domainTemplates, ξαναγεμίζει με τα προεπιλεγμένα
  // seed δεδομένα — αλλιώς οι προτάσεις τομέων θα έμεναν μόνιμα άδειες μετά την επαναφορά.
  await ensureDomainTemplatesSeeded()
  await setLastBackupAt(new Date().toISOString())
}
