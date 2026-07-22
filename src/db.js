import Dexie from 'dexie'
import dexieCloud from 'dexie-cloud-addon'
import { DOMAINS, DOMAIN_IDS } from './config/domains.js'
import { DOMAIN_TEMPLATES_SEED } from './config/domainTemplates.js'
import { addDays, todayLocalISO } from './utils/date.js'
import { resolveOccurrencesForDate } from './utils/scheduleResolution.js'
import { sameStudentSet, matchedSession } from './utils/dailyQueue.js'

// Sprint 5A Phase 1 — η ΠΑΡΟΥΣΙΑ του env var είναι το ίδιο το feature flag. Exported ώστε το
// auth module (src/auth/) να διαβάζει ΤΟ ΙΔΙΟ flag αντί να ξαναδιαβάζει ανεξάρτητα το
// import.meta.env (μία πηγή αλήθειας, καμία εξάρτηση σε σειρά import μεταξύ modules).
export const CLOUD_ENABLED = Boolean(import.meta.env.VITE_DEXIE_CLOUD_URL)

// Το dexie-cloud-addon πρέπει να περαστεί ΕΔΩ, στον constructor (Phase 0 §Εύρημα 2) — η ίδια η
// ύπαρξη του db.cloud API εξαρτάται από αυτό. Σκόπιμα ΟΧΙ Dexie.addons.push(dexieCloud) (global
// registration): θα ενεργοποιούσε το addon για κάθε μελλοντικό Dexie instance ανεξάρτητα από το
// flag, με συμπεριφορά που θα εξαρτιόταν εύθραυστα από τη σειρά import μεταξύ modules. Με flag
// off, το δεύτερο όρισμα είναι {} — η βάση λειτουργεί ακριβώς όπως πριν, χωρίς cloud addon.
//
// Όλα τα δεδομένα μένουν τοπικά στη συσκευή (IndexedDB) — καμία αποστολή σε server, εκτός αν
// ενεργός ο λογαριασμός ΚΑΙ ξεκινήσει ρητά sync σε μελλοντικό sprint (βλ. unsyncedTables παρακάτω).
export const db = new Dexie('workspace', CLOUD_ENABLED ? { addons: [dexieCloud] } : {})

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

db.version(6).stores({
  students: '++id, code, active',
  goals: '++id, studentId, status, priority',
  domainTemplates: 'domain',
  sessions: '++id, date',
  measurements: '++id, sessionId, studentId, goalId',
  observations: '++id, studentId, date',
  appMeta: 'key',
  // Επίμονο (persisted) προσχέδιο έκθεσης — αντικαθιστά το εφήμερο local state του ReportTab, ώστε
  // να επιβιώνει σε refresh/αλλαγή tab και να υπάρχει ιστορικό εκθέσεων ανά μαθητή. `type`: σήμερα
  // πάντα 'progress' — το πεδίο υπάρχει από τώρα ώστε μελλοντικοί τύποι έκθεσης (π.χ. AI-generated
  // σύνοψη) να μην απαιτήσουν νέο migration, μόνο νέα τιμή. `status`: 'draft' | 'final' — καθαρά
  // ετικέτα/φίλτρο, δεν κλειδώνει την επεξεργασία.
  reports: '++id, studentId, generatedAt'
})

db.version(7).stores({
  students: '++id, code, active',
  goals: '++id, studentId, status, priority',
  domainTemplates: 'domain',
  sessions: '++id, date',
  measurements: '++id, sessionId, studentId, goalId',
  observations: '++id, studentId, date',
  appMeta: 'key',
  reports: '++id, studentId, generatedAt',
  // «Η μέρα μου» (εσωτερικό όνομα: daily queue) — πρόθεση για τη σημερινή σειρά μαθητών/ομάδων,
  // ΟΧΙ γεγονός. Σκόπιμα ΚΑΜΙΑ αναφορά σε sessionId ή αποθηκευμένη κατάσταση «ολοκληρώθηκε» —
  // αυτό προκύπτει πάντα ζωντανά από τις πραγματικές συνεδρίες της ημέρας (βλ. utils/dailyQueue.js),
  // ώστε η ουρά να μην μπορεί ποτέ να ξεσυγχρονιστεί από αυτές (π.χ. αν μια συνεδρία διαγραφεί/
  // διορθωθεί αργότερα από το Session History). `status`: 'pending' | 'skipped' — καθαρά η δική
  // της πρόθεση, υποχωρεί αυτόματα μπροστά στην πραγματικότητα αν υπάρχει ήδη matching συνεδρία.
  dailyQueue: '++id, date'
})

db.version(8).stores({
  students: '++id, code, active',
  goals: '++id, studentId, status, priority',
  domainTemplates: 'domain',
  sessions: '++id, date',
  measurements: '++id, sessionId, studentId, goalId',
  observations: '++id, studentId, date',
  appMeta: 'key',
  reports: '++id, studentId, generatedAt',
  // dailyQueue: το ίδιο schema με το v7 (το νέο πεδίο scheduleSeriesId είναι μη-indexed προσθήκη,
  // δεν χρειάζεται δικό του bump — μπαίνει εδώ επειδή έτσι κι αλλιώς γίνεται bump για τους 3
  // παρακάτω νέους πίνακες). nullable: null = χειροκίνητη προσθήκη (Sprint 5 add-individual/
  // add-group), αριθμός = προήλθε από αυτό το ScheduleSlot series κατά την αυτόματη παραγωγή
  // (βλ. utils/scheduleGeneration.js) — χρησιμοποιείται μόνο για τη γέφυρα «Άλλαξε μόνιμα στο
  // πρόγραμμα» από μια γραμμή προς το αντίστοιχο πρότυπο-slot, καμία επίδραση στο matching/done.
  // (επιπλέον, μη-indexed: plannedTime — η προγραμματισμένη ώρα την ώρα της παραγωγής, βλ.
  // utils/scheduleGeneration.js· δείχνεται πάντα αμετάβλητη στο UI ό,τι κι αν συμβεί αργότερα)
  dailyQueue: '++id, date',
  // Σταθερό εβδομαδιαίο πρόγραμμα (Sprint 6). Κάθε γραμμή είναι ΜΙΑ έκδοση μιας επαναλαμβανόμενης
  // ανάθεσης — seriesId σταθερό σε όλες τις εκδόσεις της ίδιας ανάθεσης (ίδιο με το id της πρώτης
  // έκδοσης). effectiveUntil: null σημαίνει «ισχύει ακόμα». Βλ. saveScheduleSlot/editScheduleSlot
  // παρακάτω για τη λογική εκδόσεων ανά ημερομηνία ισχύος.
  scheduleSlots: '++id, seriesId, dayOfWeek',
  // Εξαιρέσεις συγκεκριμένης ημερομηνίας πάνω στο πρότυπο (ακύρωση/μετακίνηση ΜΙΑΣ εμφάνισης,
  // χωρίς να αλλάζει το ίδιο το πρότυπο). type: 'cancelled' | 'moved'. Για 'moved', τα
  // studentIds/slotType/startTime/durationMinutes/label είναι στιγμιότυπο (snapshot) του slot τη
  // στιγμή της μετακίνησης — ΟΧΙ ζωντανή αναφορά, ώστε μια μετέπειτα επεξεργασία του προτύπου να
  // μην αλλάξει αθόρυβα μια ήδη μετακινημένη εμφάνιση (Technical Plan §4).
  scheduleExceptions: '++id, seriesId, originalDate',
  // Έκτακτα γεγονότα ημερολογίου (Sprint 6) — καθαρά πληροφοριακά, καμία foreign key προς
  // schedule/sessions (Technical Plan §7). category προαιρετική.
  calendarEvents: '++id, date'
})

// Sprint 5A Phase 2, Commit 1 — ΘΕΜΕΛΙΟ ΜΟΝΟ: παράλληλες "_v2" δηλώσεις, ίδιοι indexed δείκτες με
// τις αντίστοιχες παλιές, string `id` αντί για `++id` (Phase 2 Technical Plan §1 — plain id, όχι
// @id, καμία εξάρτηση σε server-assigned prefix/αρχικό sync). Οι ΠΑΛΙΕΣ δηλώσεις παραπάνω ΔΕΝ
// αγγίζονται καθόλου. ΚΑΜΙΑ migration/activeTable/switchover λογική ακόμα — αυτό είναι απλώς το
// σχήμα· τίποτα δεν γράφει ή διαβάζει από αυτούς τους πίνακες μέχρι το Commit 2.
// domainTemplates_v2 ΕΠΙΤΗΔΕΣ 'id, domain' (ΟΧΙ 'domain' ως primary key όπως ο παλιός πίνακας) —
// το domain name από μόνο του δεν είναι global μοναδικό μεταξύ χρηστών (Phase 2 Technical Plan
// Rev.2 §1, ζωντανά επιβεβαιωμένο με δύο πραγματικούς χρήστες και το ίδιο 'communication').
db.version(11).stores({
  students_v2: 'id, code, active',
  goals_v2: 'id, studentId, status, priority',
  domainTemplates_v2: 'id, domain',
  sessions_v2: 'id, date',
  measurements_v2: 'id, sessionId, studentId, goalId',
  observations_v2: 'id, studentId, date',
  appMeta: 'key', // ΚΑΜΙΑ _v2 εκδοχή — μόνιμα τοπικό/ανά-συσκευή, ποτέ δεν συγχρονίζεται
  reports_v2: 'id, studentId, generatedAt',
  dailyQueue_v2: 'id, date',
  scheduleSlots_v2: 'id, seriesId, dayOfWeek',
  scheduleExceptions_v2: 'id, seriesId, originalDate',
  calendarEvents_v2: 'id, date'
})

// Sprint 5A Phase 1 — ΠΡΕΠΕΙ να τρέξει εδώ: αμέσως μετά την ΤΕΛΕΥΤΑΙΑ δήλωση schema (db.tables
// είναι πλήρες μόνο μετά από αυτές) και πριν από οποιοδήποτε query/open. unsyncedTables παίρνει
// ΚΥΡΙΟΛΕΚΤΙΚΑ όλους τους πίνακες — καμία εξαίρεση — ώστε η σύνδεση λογαριασμού σε αυτή τη φάση να
// είναι αποκλειστικά ταυτότητα, χωρίς κανένα δεδομένο μαθητή να μπορεί να συγχρονιστεί (μηχανισμός,
// όχι μόνο πρόθεση). Το ΠΟΙΟΙ πίνακες θα συγχρονίζονται πραγματικά αποφασίζεται σε μελλοντικό sprint.
// Σκόπιμα ΑΝΑΛΛΟΙΩΤΟ σε αυτό το commit: το blanket db.tables.map() sweep ήδη καλύπτει και τους
// νέους _v2 πίνακες αυτόματα (παραμένουν unsynced, όπως πρέπει μέχρι να υπάρξει πραγματική sync
// λογική) — η ρητή, generation-aware αναδιατύπωση είναι Commit 2 (Phase 2 Technical Plan Rev.3 §helpers).
if (CLOUD_ENABLED) {
  db.cloud.configure({
    databaseUrl: import.meta.env.VITE_DEXIE_CLOUD_URL,
    unsyncedTables: db.tables.map((t) => t.name)
  })
}

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
  await db.transaction('rw', [db.students, db.goals, db.measurements, db.observations, db.sessions, db.scheduleSlots], async () => {
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

    // Ίδιο σκεπτικό με τα sessions παραπάνω, εφαρμοσμένο στην ΤΡΕΧΟΥΣΑ έκδοση κάθε σειράς
    // προγράμματος (Sprint 6) — παλιότερες εκδόσεις (ιστορικό) δεν αγγίζονται.
    const allSlots = await db.scheduleSlots.toArray()
    const slots = allSlots.filter((s) => s.studentIds?.includes(studentId))
    for (const slot of slots) {
      const studentIds = slot.studentIds.filter((id) => id !== studentId)
      if (studentIds.length === 0) {
        await db.scheduleSlots.update(slot.id, { active: false })
      } else {
        await db.scheduleSlots.update(slot.id, { studentIds })
      }
    }

    await db.students.delete(studentId)
  })
}

// Διαγραφή συνεδρίας: οι μετρήσεις της διαγράφονται μαζί της (δεν έχουν νόημα χωρίς τη συνεδρία
// που τις παρήγαγε). Οι παρατηρήσεις που τυχόν συνδέονται με sessionId ΔΕΝ διαγράφονται — μόνο
// αποσυνδέονται (sessionId: null) — παραμένουν έγκυρο ιστορικό γεγονός ακόμα κι αν η συνεδρία
// διαγραφεί (π.χ. λανθασμένη καταχώρηση).
export async function deleteSession(sessionId) {
  await db.transaction('rw', [db.sessions, db.measurements, db.observations], async () => {
    await db.measurements.where('sessionId').equals(sessionId).delete()
    // sessionId δεν είναι indexed πεδίο στο observations (μόνο studentId/date) — φιλτράρισμα στη
    // μνήμη αντί για .where(), ίδιο μοτίβο με το deleteStudent() παραπάνω.
    const allObservations = await db.observations.toArray()
    const linkedObservations = allObservations.filter((o) => o.sessionId === sessionId)
    for (const o of linkedObservations) {
      await db.observations.update(o.id, { sessionId: null })
    }
    await db.sessions.delete(sessionId)
  })
}

// ---------------------------------------------------------------------------------------------
// Sprint 6 — Πρόγραμμα εκπαιδευτικού & ημερολόγιο
// ---------------------------------------------------------------------------------------------

// Δημιουργεί την ΠΡΩΤΗ έκδοση μιας νέας επαναλαμβανόμενης ανάθεσης. Two-step: το seriesId μιας
// σειράς είναι το ίδιο το id της πρώτης της έκδοσης — χρειάζεται να ξέρουμε το id πριν το ορίσουμε.
export async function createScheduleSlot({ dayOfWeek, startTime, durationMinutes, type, studentIds, label }) {
  const id = await db.scheduleSlots.add({
    seriesId: null,
    dayOfWeek,
    startTime,
    durationMinutes,
    type,
    studentIds,
    label: label || '',
    active: true,
    effectiveFrom: todayLocalISO(),
    effectiveUntil: null
  })
  await db.scheduleSlots.update(id, { seriesId: id })
  return id
}

// Επεξεργασία με «Από πότε ισχύει;» (effectiveMode: 'today' | 'date', effectiveDate μόνο για 'date').
// In-place ενημέρωση ΜΟΝΟ όταν η ΝΕΑ αλλαγή ισχύει από σήμερα (newEffectiveFrom === today) ΚΑΙ η
// τρέχουσα έκδοση ξεκίνησε επίσης σήμερα — αποφεύγει περιττή τρίτη έκδοση την ίδια μέρα (π.χ.
// διόρθωση τυπογραφικού λάθους αμέσως μετά την αρχική καταχώρηση). ΠΡΟΣΟΧΗ (bug fix): ο έλεγχος
// ΠΡΕΠΕΙ να αφορά το newEffectiveFrom, όχι μόνο το current.effectiveFrom — αλλιώς μια ρητά επιλεγμένη
// ΜΕΛΛΟΝΤΙΚΗ ημερομηνία σε slot που δημιουργήθηκε σήμερα εφαρμοζόταν σιωπηλά αμέσως, αγνοώντας
// εντελώς την επιλογή «Από συγκεκριμένη ημερομηνία» (πραγματικό bug, βρέθηκε σε e2e walkthrough).
// Σε κάθε άλλη περίπτωση: η τρέχουσα έκδοση κλείνει και δημιουργείται νέα, ίδιο seriesId, από την
// επιλεγμένη ημερομηνία (Technical Plan §3 — καμία λίστα «εκκρεμών αλλαγών», καμία ένδειξη στο UI).
export async function saveScheduleSlotEdit(currentSlotId, changes, effectiveMode, effectiveDate) {
  const current = await db.scheduleSlots.get(currentSlotId)
  if (!current) return
  const today = todayLocalISO()
  const newEffectiveFrom = effectiveMode === 'date' ? effectiveDate : today

  if (current.effectiveFrom === today && newEffectiveFrom === today) {
    await db.scheduleSlots.update(currentSlotId, changes)
    return
  }

  const { id: _oldId, ...currentWithoutId } = current
  await db.transaction('rw', db.scheduleSlots, async () => {
    await db.scheduleSlots.update(currentSlotId, { effectiveUntil: addDays(newEffectiveFrom, -1) })
    await db.scheduleSlots.add({
      ...currentWithoutId,
      ...changes,
      seriesId: current.seriesId,
      effectiveFrom: newEffectiveFrom,
      effectiveUntil: null
    })
  })
}

// Παύση/επανενεργοποίηση — άμεση, in-place, ΧΩΡΙΣ effective-dating (αναστρέψιμο tap, όχι
// «αλλαγή προγράμματος» — Product Design: «προσωρινή απενεργοποίηση χωρίς οριστική διαγραφή»).
export async function pauseScheduleSlot(currentSlotId, active) {
  await db.scheduleSlots.update(currentSlotId, { active })
}

// «Διαγραφή» ενός slot = τερματισμός της σειράς από μια ημερομηνία και μετά (effectiveUntil στην
// τρέχουσα έκδοση) — ΠΟΤΕ πραγματική διαγραφή γραμμών, ώστε το ιστορικό (Session.slotId) να μην
// χάνει ποτέ σημείο αναφοράς. Ίδιο «Από πότε ισχύει;» ερώτημα με την επεξεργασία.
export async function endScheduleSlotSeries(currentSlotId, effectiveMode, effectiveDate) {
  const current = await db.scheduleSlots.get(currentSlotId)
  if (!current) return
  const today = todayLocalISO()
  const stopFrom = effectiveMode === 'date' ? effectiveDate : today
  await db.scheduleSlots.update(currentSlotId, { effectiveUntil: addDays(stopFrom, -1) })
}

// «Αντιγραφή ημέρας»: αντιγράφει τα ενεργά, τρέχοντα slots μιας ημέρας εβδομάδας σε μία ή
// περισσότερες ημέρες-στόχους, ως ΝΕΕΣ, ανεξάρτητες σειρές (νέο seriesId η καθεμιά — η αντιγραφή
// δεν συνδέει τα αντίγραφα με το πρωτότυπο, ίδια λογική με «δημιουργία από την αρχή» απλά γρήγορα).
// mode: 'append' (προσθήκη δίπλα σε ό,τι ήδη υπάρχει) | 'replace' (τερματισμός πρώτα ό,τι ήδη
// υπάρχει ενεργό στην ημέρα-στόχο, από σήμερα).
//
// Sprint 6, δεύτερος γύρος διορθώσεων — bug: σε mode 'replace' πάνω σε ήδη ΠΑΡΑΧΘΕΙΣΑ ημέρα
// (π.χ. σήμερα), οι παλιές γραμμές dailyQueue έμεναν «ορφανές» (η σειρά τους έκλεινε, αλλά η ίδια
// η γραμμή παρέμενε), ενώ οι νέες προστίθεντο δίπλα τους — διπλές/μπερδεμένες γραμμές αντί για
// πραγματική αντικατάσταση. Τώρα, μετά το κλείσιμο των παλιών σειρών, καθαρίζονται οι μη επιλυμένες
// (χωρίς matching session), schedule-generated γραμμές αυτών ΤΩΝ σειρών σε ήδη παραχθείσες ημέρες
// (σήμερα/μέλλον) — ΠΟΤΕ χειροκίνητες γραμμές, ΠΟΤΕ ήδη completed/notHeld ιστορικό — και ξανατρέχει
// η (ήδη idempotent) παραγωγή γι' αυτές τις ημέρες ώστε να μπουν οι νέες εμφανίσεις.
export async function copyScheduleDay(fromDayOfWeek, toDayOfWeek, mode = 'append') {
  const today = todayLocalISO()
  const allSlots = await db.scheduleSlots.toArray()
  const sourceActive = allSlots.filter((s) => {
    if (s.dayOfWeek !== fromDayOfWeek || !s.active) return false
    return s.effectiveFrom <= today && (!s.effectiveUntil || s.effectiveUntil >= today)
  })

  let closedSeriesIds = []
  if (mode === 'replace') {
    const targetActive = allSlots.filter((s) => {
      if (s.dayOfWeek !== toDayOfWeek || !s.active) return false
      return s.effectiveFrom <= today && (!s.effectiveUntil || s.effectiveUntil >= today)
    })
    closedSeriesIds = targetActive.map((s) => s.seriesId)
    for (const slot of targetActive) {
      await db.scheduleSlots.update(slot.id, { effectiveUntil: addDays(today, -1) })
    }
  }

  for (const slot of sourceActive) {
    await createScheduleSlot({
      dayOfWeek: toDayOfWeek,
      startTime: slot.startTime,
      durationMinutes: slot.durationMinutes,
      type: slot.type,
      studentIds: slot.studentIds,
      label: slot.label
    })
  }

  if (closedSeriesIds.length > 0) {
    await cleanupReplacedScheduleEntries(closedSeriesIds, today)
  }
}

// Βοηθητική για το copyScheduleDay(mode='replace') παραπάνω — δεν εξάγεται, δεν χρειάζεται
// ξεχωριστό δημόσιο σημείο εισόδου. Idempotent: αν κληθεί ξανά με τις ίδιες σειρές, οι γραμμές
// προς αφαίρεση είτε ήδη έχουν αφαιρεθεί (τίποτα να διαγραφεί) είτε πλέον έχουν πραγματική
// συνεδρία (πλέον προστατεύονται) — καμία περίπτωση διπλής διαγραφής ή διπλής παραγωγής, αφού το
// ensureDayGenerated είναι ήδη το ίδιο idempotent.
async function cleanupReplacedScheduleEntries(closedSeriesIds, today) {
  const closedSet = new Set(closedSeriesIds)
  const entries = await db.dailyQueue.where('date').aboveOrEqual(today).toArray()
  const affectedDates = new Set()

  for (const entry of entries) {
    if (entry.scheduleSeriesId == null || !closedSet.has(entry.scheduleSeriesId)) continue // χειροκίνητη ή άσχετη σειρά — ΔΕΝ αγγίζεται
    const sessionsOnDate = await db.sessions.where('date').equals(entry.date).toArray()
    if (matchedSession(entry, sessionsOnDate)) continue // πραγματικό ιστορικό (completed/notHeld) — ΔΕΝ αγγίζεται
    await db.dailyQueue.delete(entry.id)
    affectedDates.add(entry.date)
  }

  for (const date of affectedDates) {
    await ensureDayGenerated(date)
  }
}

// Καταγράφει απευθείας μια συνεδρία που ΔΕΝ πραγματοποιήθηκε — χωρίς Teaching Mode, χωρίς
// μετρήσεις/διάρκεια (Technical Plan §6). Ίδια `Session` οντότητα, status='notHeld' (SPEC.md,
// υπήρχε ήδη από το Sprint 4 — απλά τώρα γράφεται και απευθείας, όχι μόνο διορθωτικά).
export async function recordSessionNotHeld({ date, studentIds, note }) {
  return db.sessions.add({
    date,
    studentIds,
    status: 'notHeld',
    absentStudentIds: [],
    durationMinutes: null,
    activity: '',
    note: note || '',
    moods: {}
  })
}

// Ενιαία «Επαναφορά στη σειρά» (Product Design, τελευταίος γύρος) — καλύπτει ΚΑΙ το skip (Sprint 5)
// ΚΑΙ το notHeld (Sprint 6) με το ίδιο κουμπί: αν η γραμμή ήταν skipped, γυρίζει σε pending· αν
// υπάρχει notHeld συνεδρία που ταιριάζει, διαγράφεται — ΠΟΤΕ και τα δύο ταυτόχρονα, η γραμμή είτε
// είναι skipped είτε έχει matching συνεδρία, ποτέ κάτι άλλο. Αν τελικά πραγματοποιηθεί αργότερα,
// θα υπάρξει ΜΙΑ και μοναδική πραγματική Session (η notHeld έχει ήδη εξαφανιστεί).
export async function restoreDailyQueueEntry(entry) {
  if (entry.status === 'skipped') {
    await db.dailyQueue.update(entry.id, { status: 'pending' })
    return
  }
  const sessionsOnDate = await db.sessions.where('date').equals(entry.date).toArray()
  const notHeld = sessionsOnDate.find((s) => s.status === 'notHeld' && sameStudentSet(s.studentIds, entry.studentIds))
  if (notHeld) {
    await db.sessions.delete(notHeld.id)
  }
}

// Ακύρωση/μετακίνηση ΜΙΑΣ εμφάνισης συγκεκριμένης ημερομηνίας (Technical Plan §4, §1 τελευταίου
// γύρου) — ΠΑΝΤΑ καταγράφεται ScheduleException, ανεξάρτητα από το αν η ημέρα-πηγή έχει ήδη
// παραχθεί. Αν έχει ήδη παραχθεί (υπάρχει ήδη γραμμή dailyQueue γι' αυτή τη σειρά σε αυτή την
// ημερομηνία), η γραμμή «κλείνει» ΑΜΕΣΩΣ μέσω notHeld συνεδρίας — ίδιος μηχανισμός με το χειροκίνητο
// «Δεν πραγματοποιήθηκε», όχι διαγραφή της γραμμής. Για μετακίνηση, στιγμιότυπο (snapshot) του
// περιεχομένου του slot ΤΗ ΣΤΙΓΜΗ της μετακίνησης — όχι ζωντανή αναφορά (§4).
export async function applyScheduleException({ type, seriesId, originalDate, newDate, reason }) {
  let snapshot = {}
  if (type === 'moved') {
    const versions = await db.scheduleSlots.where('seriesId').equals(seriesId).toArray()
    const active = versions.find(
      (v) => v.effectiveFrom <= originalDate && (!v.effectiveUntil || v.effectiveUntil >= originalDate)
    )
    if (active) {
      snapshot = {
        studentIds: active.studentIds,
        slotType: active.type,
        startTime: active.startTime,
        durationMinutes: active.durationMinutes,
        label: active.label
      }
    }
  }

  await db.scheduleExceptions.add({
    seriesId,
    originalDate,
    type,
    newDate: newDate || null,
    reason: reason || '',
    ...snapshot
  })

  const originEntries = await db.dailyQueue.where('date').equals(originalDate).toArray()
  const originEntry = originEntries.find((e) => e.scheduleSeriesId === seriesId)
  if (originEntry) {
    const sessionsOnDate = await db.sessions.where('date').equals(originalDate).toArray()
    const alreadyResolved = sessionsOnDate.some((s) => sameStudentSet(s.studentIds, originEntry.studentIds))
    if (!alreadyResolved) {
      const note = type === 'moved' ? `Μετακινήθηκε σε ${newDate}` : reason || ''
      await recordSessionNotHeld({ date: originalDate, studentIds: originEntry.studentIds, note })
    }
  }

  if (type === 'moved' && newDate) {
    await ensureDayGenerated(newDate)
  }
}

// Φυσικά idempotent παραγωγή της «Η μέρα μου» (Technical Plan, αναθεωρημένο — ΧΩΡΙΣ appMeta
// marker): ασφαλής να ξανατρέξει όσες φορές θέλει. Για κάθε επιλυμένη εμφάνιση ελέγχει αν υπάρχει
// ήδη γραμμή dailyQueue για (date, scheduleSeriesId) — αν ναι, αγνοείται· αν όχι, προστίθεται.
// Καμία ανάγκη να «θυμάται» ότι έτρεξε — λειτουργεί αποκλειστικά πάνω σε κανονικούς, backed-up
// πίνακες, άρα ασφαλής σε backup/restore και μελλοντικό sync.
//
// ΟΛΟΚΛΗΡΗ η λειτουργία (ανάγνωση ήδη υπαρχόντων + εγγραφή των νέων) μέσα σε ΜΙΑ Dexie συναλλαγή:
// χωρίς αυτό, δύο ταυτόχρονες κλήσεις (π.χ. React StrictMode double-effect σε dev, ή μελλοντικά
// δύο components που ζητούν την ίδια μέρα ταυτόχρονα) θα μπορούσαν και οι δύο να διαβάσουν «καμία
// γραμμή ακόμα» πριν προλάβει η πρώτη να γράψει, παράγοντας διπλές εγγραφές — ακριβώς αυτό που η
// ιδεμποτέντεια υπόσχεται να αποκλείει. Η συναλλαγή σειριοποιεί τις κλήσεις.
export async function ensureDayGenerated(date) {
  await db.transaction('rw', [db.scheduleSlots, db.scheduleExceptions, db.dailyQueue], async () => {
    const [scheduleSlots, scheduleExceptions, existingEntries] = await Promise.all([
      db.scheduleSlots.toArray(),
      db.scheduleExceptions.toArray(),
      db.dailyQueue.where('date').equals(date).toArray()
    ])

    const occurrences = resolveOccurrencesForDate(date, { scheduleSlots, scheduleExceptions })
    const existingSeriesIds = new Set(existingEntries.map((e) => e.scheduleSeriesId).filter((id) => id != null))
    const toInsert = occurrences.filter((o) => !existingSeriesIds.has(o.seriesId))
    if (toInsert.length === 0) return

    let nextOrder = existingEntries.reduce((max, e) => Math.max(max, e.order), -1) + 1
    await db.dailyQueue.bulkAdd(
      toInsert.map((o) => ({
        date,
        studentIds: o.studentIds,
        order: nextOrder++,
        status: 'pending',
        scheduleSeriesId: o.seriesId,
        plannedTime: o.startTime,
        plannedDuration: o.durationMinutes
      }))
    )
  })
}

// Μαζική ακύρωση όλων των σημερινών προγραμματισμένων εμφανίσεων μιας ημερομηνίας (Product Design
// §7 — σύνδεση με calendar event αργίας/σχολικής εκδήλωσης). Επαναχρησιμοποιεί το ΙΔΙΟ
// applyScheduleException ανά σειρά — καμία ξεχωριστή «ημέρα κλειστή» έννοια.
export async function bulkCancelDay(date, reason) {
  const [scheduleSlots, scheduleExceptions] = await Promise.all([
    db.scheduleSlots.toArray(),
    db.scheduleExceptions.toArray()
  ])
  const occurrences = resolveOccurrencesForDate(date, { scheduleSlots, scheduleExceptions })
  for (const o of occurrences) {
    await applyScheduleException({ type: 'cancelled', seriesId: o.seriesId, originalDate: date, reason })
  }
  return occurrences.length
}

export async function getLastBackupAt() {
  const row = await db.appMeta.get('lastBackupAt')
  return row?.value || null
}

export async function setLastBackupAt(isoDate) {
  await db.appMeta.put({ key: 'lastBackupAt', value: isoDate })
}

export default db
