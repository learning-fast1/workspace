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

// Ονόματα πινάκων δεδομένων προς backup — αντλείται απευθείας από το σχήμα της Dexie (όχι
// ξεχωριστή χειροκίνητη λίστα), ώστε ένας νέος πίνακας σε μελλοντική db.version() να μπαίνει
// αυτόματα στο backup χωρίς να χρειάζεται να θυμηθεί κανείς να τον προσθέσει εδώ.
// Το appMeta εξαιρείται — είναι μεταδεδομένα της συσκευής, όχι δεδομένα μαθητών.
export const DATA_TABLE_NAMES = db.tables.map((t) => t.name).filter((name) => name !== 'appMeta')

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

  // null = «δεν χρειάζεται αλλαγή» (ήδη έγκυρο id) — ΔΕΝ σημαίνει «άγνωστο». Για το άγνωστο
  // περίπτωση κάνουμε console.warn ξεχωριστά, ώστε να μη μένει τελείως αθόρυβα «σπασμένο».
  function toId(value, context) {
    if (validIds.has(value)) return null
    const mapped = LEGACY_DOMAIN_NAME_TO_ID[value]
    if (mapped) return mapped
    if (value) {
      console.warn(`[migrateDomainNamesToIds] Άγνωστος τομέας «${value}» σε ${context} — παραμένει ως έχει, δεν αντιστοιχίζεται σε κανένα υπάρχον id.`)
    }
    return null
  }

  const [goals, students, templates] = await Promise.all([
    db.goals.toArray(),
    db.students.toArray(),
    db.domainTemplates.toArray()
  ])

  for (const g of goals) {
    const newId = toId(g.domain, `goal id=${g.id}`)
    if (newId) await db.goals.update(g.id, { domain: newId })
  }

  for (const s of students) {
    if (!s.functionalProfile?.length) continue
    let changed = false
    const updated = s.functionalProfile.map((entry) => {
      const newId = toId(entry.domain, `functionalProfile του μαθητή id=${s.id}`)
      if (!newId) return entry
      changed = true
      return { ...entry, domain: newId }
    })
    if (changed) await db.students.update(s.id, { functionalProfile: updated })
  }

  for (const t of templates) {
    const newId = toId(t.domain, 'domainTemplates')
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

// Οριστική διαγραφή μαθητή και ΟΛΩΝ των δεδομένων του (goals, measurements, observations).
// Οι ομαδικές συνεδρίες δεν διαγράφονται — αφαιρείται μόνο ο μαθητής από τη συνεδρία, εκτός
// αν έμενε μόνος του σε αυτήν, οπότε η συνεδρία διαγράφεται κι εκείνη (δεν έχει πια νόημα).
export async function deleteStudent(studentId) {
  await db.transaction('rw', [db.students, db.goals, db.measurements, db.observations, db.sessions], async () => {
    await db.goals.where('studentId').equals(studentId).delete()
    await db.measurements.where('studentId').equals(studentId).delete()
    await db.observations.where('studentId').equals(studentId).delete()

    // studentIds δεν είναι indexed (πίνακας) — φιλτράρισμα στη μνήμη αντί για .where().
    const allSessions = await db.sessions.toArray()
    const sessions = allSessions.filter((s) => s.studentIds?.includes(studentId))
    for (const session of sessions) {
      const studentIds = session.studentIds.filter((id) => id !== studentId)
      if (studentIds.length === 0) {
        await db.sessions.delete(session.id)
      } else {
        const absentStudentIds = (session.absentStudentIds || []).filter((id) => id !== studentId)
        await db.sessions.update(session.id, { studentIds, absentStudentIds })
      }
    }

    await db.students.delete(studentId)
  })
}

export async function getLastBackupAt() {
  const row = await db.appMeta.get('lastBackupAt')
  return row?.value || null
}

export async function setLastBackupAt(isoDate) {
  await db.appMeta.put({ key: 'lastBackupAt', value: isoDate })
}

export default db
