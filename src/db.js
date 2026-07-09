import Dexie from 'dexie'
import { DOMAINS, DOMAIN_IDS } from './config/domains.js'
import { DOMAIN_TEMPLATES_SEED } from './config/domainTemplates.js'

// Όλα τα δεδομένα μένουν τοπικά στη συσκευή (IndexedDB) — καμία αποστολή σε server.
export const db = new Dexie('workspace')

db.version(1).stores({
  // ++id: auto-increment primary key. Δείκτες σε code/active για γρήγορη λίστα/φιλτράρισμα.
  students: '++id, code, active'
})

db.version(2).stores({
  students: '++id, code, active',
  // Δείκτες σε studentId/status/priority για τη λίστα στόχων ανά μαθητή.
  goals: '++id, studentId, status, priority'
})

db.version(3).stores({
  students: '++id, code, active',
  goals: '++id, studentId, status, priority',
  // domain ως primary key: ένα template ανά τομέα.
  domainTemplates: 'domain'
})

db.version(4).stores({
  students: '++id, code, active',
  goals: '++id, studentId, status, priority',
  domainTemplates: 'domain',
  sessions: '++id, date',
  measurements: '++id, sessionId, studentId, goalId',
  observations: '++id, studentId, date'
})

db.version(5).stores({
  students: '++id, code, active',
  goals: '++id, studentId, status, priority',
  domainTemplates: 'domain',
  sessions: '++id, date',
  measurements: '++id, sessionId, studentId, goalId',
  observations: '++id, studentId, date',
  // key/value πίνακας για μεταδεδομένα της συσκευής (π.χ. ημερομηνία τελευταίου backup) — όχι δεδομένα μαθητών.
  appMeta: 'key'
})

// Ονόματα πινάκων δεδομένων (χωρίς το appMeta, που είναι μεταδεδομένα συσκευής όχι δεδομένα προς backup).
export const DATA_TABLE_NAMES = ['students', 'goals', 'domainTemplates', 'sessions', 'measurements', 'observations']

// Ιστορικές ελληνικές ονομασίες τομέων → σημερινό id (src/config/domains.js).
// Χρησιμοποιείται ΜΟΝΟ για migration παλιών εγγραφών· πουθενά αλλού στην εφαρμογή.
const LEGACY_DOMAIN_NAME_TO_ID = {
  'Λεπτή κινητικότητα': 'fine-motor',
  'Αδρή κινητικότητα': 'gross-motor',
  'Προσοχή/Συγκέντρωση': 'attention',
  'Εκτελεστικές λειτουργίες': 'executive-functions',
  'Αισθητηριακός τομέας': 'sensory',
  'Αισθητηριακές ανάγκες': 'sensory',
  'Φωνολογική ενημερότητα': 'phonological-awareness',
  'Ανάγνωση': 'reading',
  'Γραπτός λόγος': 'writing',
  'Γραφή': 'writing',
  'Μαθηματικά': 'math',
  'Προφορικός λόγος': 'oral-language',
  'Επικοινωνία': 'oral-language',
  'Κοινωνικές δεξιότητες': 'social-skills',
  'Συναισθηματική ανάπτυξη': 'emotional-development',
  'Αυτοεξυπηρέτηση': 'self-care',
  'Συμπεριφορά': 'behavior'
}

// Μετατρέπει παλιές εγγραφές (goals, functionalProfile, domainTemplates) που αποθήκευαν
// την ελληνική ονομασία του τομέα, ώστε να χρησιμοποιούν το σταθερό id. Ασφαλές να τρέξει
// πολλές φορές — αγγίζει μόνο εγγραφές που δεν έχουν ήδη έγκυρο id.
export async function migrateDomainNamesToIds() {
  const validIds = new Set(DOMAIN_IDS)
  const toId = (value) => (validIds.has(value) ? null : LEGACY_DOMAIN_NAME_TO_ID[value] || null)

  const goals = await db.goals.toArray()
  for (const g of goals) {
    const newId = toId(g.domain)
    if (newId) await db.goals.update(g.id, { domain: newId })
  }

  const students = await db.students.toArray()
  for (const s of students) {
    if (!s.functionalProfile?.length) continue
    let changed = false
    const updated = s.functionalProfile.map((entry) => {
      const newId = toId(entry.domain)
      if (!newId) return entry
      changed = true
      return { ...entry, domain: newId }
    })
    if (changed) await db.students.update(s.id, { functionalProfile: updated })
  }

  const templates = await db.domainTemplates.toArray()
  for (const t of templates) {
    const newId = toId(t.domain)
    if (!newId) continue
    const existing = await db.domainTemplates.get(newId)
    if (!existing) {
      await db.domainTemplates.put({ ...t, domain: newId })
    }
    await db.domainTemplates.delete(t.domain)
  }
}

// Γεμίζει με seed data μόνο τους τομείς που δεν έχουν ακόμα template στη βάση
// (πρώτη εκκίνηση, ή νέος τομέας που προστέθηκε αργότερα στο domains.js).
export async function ensureDomainTemplatesSeeded() {
  const existing = await db.domainTemplates.toArray()
  const existingIds = new Set(existing.map((t) => t.domain))
  const missing = DOMAINS.filter((d) => !existingIds.has(d.id))
  if (missing.length === 0) return

  await db.domainTemplates.bulkPut(
    missing.map(({ id }) => ({
      domain: id,
      suggestedMeasurementTypes: DOMAIN_TEMPLATES_SEED[id]?.suggestedMeasurementTypes || [],
      commonCriteria: DOMAIN_TEMPLATES_SEED[id]?.commonCriteria || [],
      baselineExamples: DOMAIN_TEMPLATES_SEED[id]?.baselineExamples || [],
      goalStarters: DOMAIN_TEMPLATES_SEED[id]?.goalStarters || []
    }))
  )
}

export async function getLastBackupAt() {
  const row = await db.appMeta.get('lastBackupAt')
  return row?.value || null
}

export async function setLastBackupAt(isoDate) {
  await db.appMeta.put({ key: 'lastBackupAt', value: isoDate })
}

export default db
