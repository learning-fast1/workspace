import Dexie from 'dexie'
import dexieCloud from 'dexie-cloud-addon'
import { DOMAINS, DOMAIN_IDS } from './config/domains.js'
import { FUNCTIONAL_PROFILE_DOMAIN_IDS } from './config/functionalProfileDomains.js'
import { DOMAIN_TEMPLATES_SEED } from './config/domainTemplates.js'
import { addDays, todayLocalISO } from './utils/date.js'
import { resolveOccurrencesForDate } from './utils/scheduleResolution.js'
import { sameStudentSet, matchedSession } from './utils/dailyQueue.js'
import { GOAL_TEMPLATE_FIELDS } from './utils/goalTemplates.js'
import { sortSchoolYearsByStartDate } from './utils/schoolYearFilter.js'
import { validateCriterionConfig, generateCriterionText } from './utils/measurementTypes/index.js'
import { activeTable, withNewRowId, getCachedGeneration, currentUserIdOrNull } from './migration/activeGeneration.js'
import { deterministicId } from './migration/deterministicId.js'
import { readSyncAuthorizationHint, computeUnsyncedTables } from './migration/syncAuthorizationHint.js'

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

db.version(9).stores({
  students: '++id, code, active',
  goals: '++id, studentId, status, priority',
  domainTemplates: 'domain',
  sessions: '++id, date',
  measurements: '++id, sessionId, studentId, goalId',
  observations: '++id, studentId, date',
  appMeta: 'key',
  reports: '++id, studentId, generatedAt',
  dailyQueue: '++id, date',
  scheduleSlots: '++id, seriesId, dayOfWeek',
  scheduleExceptions: '++id, seriesId, originalDate',
  calendarEvents: '++id, date',
  // Σχολικά έτη (Sprint 7, Technical Plan Στάδιο 1). isActive INDEXED (σε αντίθεση με το
  // scheduleSlots.active που φιλτράρεται σε JS) — το «ποιο είναι το ενεργό έτος» είναι ερώτημα
  // που τρέχει συχνά, ίδιο idiom με το ήδη-indexed students.active. Ακριβώς ένα row έχει
  // isActive:true τη φορά — επιβάλλεται ατομικά από το setActiveSchoolYear (Στάδιο 9), όχι εδώ.
  schoolYears: '++id, isActive',
  // Καταγραφή συμμετοχής μαθητή ανά σχολικό έτος (Technical Plan Στάδιο 9) — γεμίζει ΑΥΤΟΜΑΤΑ ως
  // παράπλευρο αποτέλεσμα υπαρχουσών ενεργειών (αρχειοθέτηση μαθητή, μετάβαση έτους), ΟΧΙ από
  // ξεχωριστή οθόνη διαχείρισης. status: 'new' | 'continued' | 'departed' | 'returned'.
  // &[studentId+schoolYearId]: compound UNIQUE index — η ίδια η IndexedDB αποτρέπει δεύτερη
  // εγγραφή για τον ίδιο συνδυασμό μαθητή/έτους (defense-in-depth πάνω από τον έλεγχο εφαρμογής
  // στο Στάδιο 9). studentId/schoolYearId παραμένουν και ξεχωριστά για queries ανά μαθητή/έτος.
  schoolYearParticipation: '++id, studentId, schoolYearId, &[studentId+schoolYearId]',
  // Ιστορικό μεταβάσεων κατάστασης στόχου (Technical Plan Στάδιο 2) — ΜΟΝΟ status transitions +
  // δημιουργία + μεταφορά έτους, ΟΧΙ field-level diffs κάθε επεξεργασίας (σκόπιμη επιλογή, βλ.
  // Product Design §3). type: 'created' | 'statusChanged' | 'revised' | 'schoolYearTransition'.
  // at INDEXED επιπλέον του goalId, για μελλοντικό cross-goal χρονολογικό ερώτημα χωρίς πλήρες scan.
  goalEvents: '++id, goalId, at',
  // Προσωπική βιβλιοθήκη στόχων του εκπαιδευτικού (Technical Plan Στάδιο 6) — ξεχωριστό από το
  // domainTemplates (ανά τομέα, seeded από το σύστημα). Χρήση = πάντα αντιγραφή τιμών σε νέο
  // goal, ποτέ ζωντανή αναφορά (βλ. Product Design §5).
  goalTemplates: '++id, domain'
}).upgrade(async (tx) => {
  // Ατομικό migration (Technical Plan Στάδιο 1) — τρέχει ΜΙΑ φορά, αυτόματα, μέσα στο ίδιο
  // IndexedDB versionchange transaction με τη δημιουργία των παραπάνω πινάκων. Αν οτιδήποτε
  // πετάξει εδώ, ΟΛΗ η μετάβαση ακυρώνεται και η βάση παραμένει στο v8 — αδύνατο να μείνει σε
  // ενδιάμεση κατάσταση (π.χ. goal ήδη 'active' χωρίς το αντίστοιχο goalEvents). Χρησιμοποιεί
  // tx.table(...) (όχι το module-level db.goals/db.goalEvents) όπως απαιτεί η Dexie μέσα σε
  // upgrade callbacks. Οι ίδιες συναρτήσεις εκτίθενται και ως idempotent exports παρακάτω, για
  // χρήση ΜΟΝΟ μετά από restoreFromBackup (βλ. utils/backup.js) — εκεί δεν συμβαίνει version
  // transition, άρα αυτό το hook δεν θα ξανατρέξει μόνο του.
  await migrateRevisedGoalStatusCore(tx.table('goals'), tx.table('goalEvents'))
  await backfillGoalEventsCore(tx.table('goals'), tx.table('goalEvents'))
})

db.version(10).stores({
  students: '++id, code, active',
  goals: '++id, studentId, status, priority',
  domainTemplates: 'domain',
  sessions: '++id, date',
  measurements: '++id, sessionId, studentId, goalId',
  observations: '++id, studentId, date',
  appMeta: 'key',
  reports: '++id, studentId, generatedAt',
  dailyQueue: '++id, date',
  scheduleSlots: '++id, seriesId, dayOfWeek',
  scheduleExceptions: '++id, seriesId, originalDate',
  calendarEvents: '++id, date',
  schoolYears: '++id, isActive',
  schoolYearParticipation: '++id, studentId, schoolYearId, &[studentId+schoolYearId]',
  goalEvents: '++id, goalId, at',
  goalTemplates: '++id, domain',
  // Κλινική εκτίμηση στόχου ανά συνεδρία (Teaching Mode) — ΣΥΜΠΛΗΡΩΜΑΤΙΚΗ του measurements, ΠΟΤΕ
  // υποκατάστατο· ένα ξεχωριστός πίνακας (ίδιο μοτίβο με το observations) αντί για πεδίο πάνω στο
  // measurements, ακριβώς επειδή μπορεί να υπάρχει εκτίμηση ΧΩΡΙΣ καμία μέτρηση εκείνη τη συνεδρία.
  // &[sessionId+goalId]: το πολύ ΜΙΑ εκτίμηση ανά (συνεδρία, στόχος), ίδιο compound-unique idiom με
  // το schoolYearParticipation. rating: 'worsened'|'stable'|'improved'|'mastered' — ΠΟΤΕ συνάγεται
  // αυτόματα (π.χ. από ύπαρξη measurement)· απουσία γραμμής = καμία εκτίμηση, ΟΧΙ "stable" εξ ορισμού.
  // 'mastered' ΔΕΝ είναι απλώς μια ακόμη βαθμίδα — ενεργοποιεί το ΗΔΗ υπάρχον transitionGoalStatus
  // (goal → 'achieved'), μέσα στο ίδιο handleSaveSession, όχι δεύτερος μηχανισμός ολοκλήρωσης.
  sessionGoalAssessments: '++id, sessionId, studentId, goalId, &[sessionId+goalId]'
})

// Sprint 5A Phase 2, Commit 1 (reconciled μετά τα Sprint 7/8) — ΘΕΜΕΛΙΟ ΜΟΝΟ: παράλληλες "_v2"
// δηλώσεις, ίδιοι indexed δείκτες με τις αντίστοιχες παλιές, string `id` αντί για `++id` (Phase 2
// Technical Plan §1 — plain id, όχι @id, καμία εξάρτηση σε server-assigned prefix/αρχικό sync). Οι
// ΠΑΛΙΕΣ δηλώσεις παραπάνω ΔΕΝ αγγίζονται καθόλου. ΚΑΜΙΑ migration/activeTable/switchover λογική
// ακόμα — αυτό είναι απλώς το σχήμα· τίποτα δεν γράφει ή διαβάζει από αυτούς τους πίνακες μέχρι το
// Commit 2. Καλύπτει πλέον ΟΛΟΚΛΗΡΟ το legacy σχήμα μέχρι και v10 (Sprint 7 school year/goal
// lifecycle + Sprint 8 clinical assessment) — reconciled εδώ αντί για ξεχωριστό v12, αφού αυτό το
// commit δεν είχε ποτέ πάει σε production/deployment (βλ. commit history).
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
  calendarEvents_v2: 'id, date',
  schoolYears_v2: 'id, isActive',
  schoolYearParticipation_v2: 'id, studentId, schoolYearId, &[studentId+schoolYearId]',
  goalEvents_v2: 'id, goalId, at',
  goalTemplates_v2: 'id, domain',
  sessionGoalAssessments_v2: 'id, sessionId, studentId, goalId, &[sessionId+goalId]'
})

// Sprint 5A Phase 1 — ΠΡΕΠΕΙ να τρέξει εδώ: αμέσως μετά την ΤΕΛΕΥΤΑΙΑ δήλωση schema (db.tables
// είναι πλήρες μόνο μετά από αυτές) και πριν από οποιοδήποτε query/open.
//
// Sprint 5A Phase 2, Commit 6 (revision) — evidence-based εύρημα ενάντια στο πραγματικό installed
// dexie-cloud-addon source (review): το updateSchemaFromOptions του addon γράφει markedForSync ΜΟΝΟ
// true→false, ΠΟΤΕ false→true, μέσα σε ΜΙΑ σελίδα-φόρτωση — άρα η ΠΡΩΤΗ (πριν το db.open()) κλήση
// configure() είναι η ΜΟΝΑΔΙΚΗ που μπορεί ΠΟΤΕ να επιτρέψει sync στους _v2 πίνακες αυτής της
// φόρτωσης· διάβασμα appMeta (ownership/migration/generation) απαιτεί ήδη db.open(), άρα είναι ΑΡΓΑ
// γι' αυτή τη συγκεκριμένη κλήση. Το readSyncAuthorizationHint() διαβάζει ΣΥΓΧΡΟΝΑ ένα ρητά «μη
// έμπιστο» localStorage hint (migration/syncAuthorizationHint.js, ΧΩΡΙΣ εξάρτηση από db.js — καμία
// κυκλική εξάρτηση εδώ) — hint απόν ⇒ η ΠΛΗΡΗΣ λίστα (ΑΚΡΙΒΩΣ η προηγούμενη, αναλλοίωτη
// συμπεριφορά, μηδενικό sync). hint παρόν ⇒ όλα ΕΚΤΟΣ από τους 16 _v2 πίνακες. Το hint ΔΕΝ
// εμπιστεύεται από μόνο του ΠΟΤΕ — αμέσως μετά το db.open(), το main.jsx καλεί
// verifySyncAuthorizationOrShutdown() που ΞΑΝΑ-επιβεβαιώνει τις 4 προϋποθέσεις πάνω στα πραγματικά
// appMeta/currentUser και αναιρεί αμέσως αν δεν ταιριάζουν (configure() ξανά με την πλήρη λίστα — η
// φορά που ΠΑΝΤΑ δουλεύει).
if (CLOUD_ENABLED) {
  db.cloud.configure({
    databaseUrl: import.meta.env.VITE_DEXIE_CLOUD_URL,
    unsyncedTables: computeUnsyncedTables({
      hint: readSyncAuthorizationHint(),
      allTableNames: db.tables.map((t) => t.name)
    })
  })
}

// Ονόματα πινάκων δεδομένων προς backup — αντλείται απευθείας από το σχήμα της Dexie (όχι
// ξεχωριστή χειροκίνητη λίστα), ώστε ένας νέος πίνακας σε μελλοντική db.version() να μπαίνει
// αυτόματα στο backup χωρίς να χρειάζεται να θυμηθεί κανείς να τον προσθέσει εδώ.
// Το appMeta εξαιρείται — είναι μεταδεδομένα της συσκευής, όχι δεδομένα μαθητών.
export const DATA_TABLE_NAMES = db.tables.map((t) => t.name).filter((name) => name !== 'appMeta')

// Ιστορικές ελληνικές ονομασίες τομέων → id. Χρησιμοποιείται ΜΟΝΟ για migration παλιών εγγραφών
// (goals/domainTemplates ΚΑΙ ξεχωριστά functionalProfile)· πουθενά αλλού στην εφαρμογή.
//
// ΔΥΟ ξεχωριστοί χάρτες, ΟΧΙ ένας κοινός — από την απλοποίηση των τομέων στόχων (8, config/domains.js)
// και την ρητή απόφαση να ΜΗΝ ακολουθήσει το functionalProfile (παραμένει στους 14, βλ.
// config/functionalProfileDomains.js): οι δύο id-χώροι διαφέρουν πλέον, άρα ένα πανάρχαιο free-text
// goal και μια πανάρχαια free-text καταχώρηση functionalProfile με το ΙΔΙΟ ελληνικό κείμενο (π.χ.
// «Λεπτή κινητικότητα») πρέπει να καταλήξουν σε ΔΙΑΦΟΡΕΤΙΚΟ id η καθεμιά.
const LEGACY_DOMAIN_NAME_TO_GOAL_ID = {
  'Λεπτή κινητικότητα': 'mobility',
  'Αδρή κινητικότητα': 'mobility',
  'Προσοχή/Συγκέντρωση': 'cognitive',
  'Εκτελεστικές λειτουργίες': 'cognitive',
  'Αισθητηριακός τομέας': 'sensory',
  'Αισθητηριακές ανάγκες': 'sensory',
  'Φωνολογική ενημερότητα': 'communication',
  'Ανάγνωση': 'communication',
  'Γραπτός λόγος': 'communication',
  'Γραφή': 'communication',
  'Μαθηματικά': 'cognitive',
  'Προφορικός λόγος': 'communication',
  'Επικοινωνία': 'communication',
  'Κοινωνικές δεξιότητες': 'social-skills',
  'Συναισθηματική ανάπτυξη': 'emotional-development',
  'Αυτοεξυπηρέτηση': 'self-care',
  'Συμπεριφορά': 'behavior'
}

const LEGACY_DOMAIN_NAME_TO_PROFILE_ID = {
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
  const validGoalIds = new Set(DOMAIN_IDS)
  // Το functionalProfile παραμένει σκόπιμα στους 14 αναλυτικούς τομείς (config/functionalProfileDomains.js,
  // ανεξάρτητο από την απλοποίηση των τομέων στόχων) — validation ΕΔΩ πρέπει να ελέγχει ΤΗ ΔΙΚΗ ΤΟΥ
  // λίστα ids, όχι το DOMAIN_IDS των στόχων, αλλιώς κάθε έγκυρη παλιά καταχώρηση θα φαινόταν
  // λανθασμένα «άγνωστη» σε κάθε εκκίνηση.
  const validProfileIds = new Set(FUNCTIONAL_PROFILE_DOMAIN_IDS)

  // null = «δεν χρειάζεται αλλαγή» (ήδη έγκυρο id) — ΔΕΝ σημαίνει «άγνωστο». Για το άγνωστο
  // περίπτωση κάνουμε console.warn ξεχωριστά, ώστε να μη μένει τελείως αθόρυβα «σπασμένο».
  function toId(value, context, validIds, legacyNameMap) {
    if (validIds.has(value)) return null
    const mapped = legacyNameMap[value]
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
    const newId = toId(g.domain, `goal id=${g.id}`, validGoalIds, LEGACY_DOMAIN_NAME_TO_GOAL_ID)
    if (newId) await db.goals.update(g.id, { domain: newId })
  }

  for (const s of students) {
    if (!s.functionalProfile?.length) continue
    let changed = false
    const updated = s.functionalProfile.map((entry) => {
      const newId = toId(entry.domain, `functionalProfile του μαθητή id=${s.id}`, validProfileIds, LEGACY_DOMAIN_NAME_TO_PROFILE_ID)
      if (!newId) return entry
      changed = true
      return { ...entry, domain: newId }
    })
    if (changed) await db.students.update(s.id, { functionalProfile: updated })
  }

  for (const t of templates) {
    const newId = toId(t.domain, 'domainTemplates', validGoalIds, LEGACY_DOMAIN_NAME_TO_GOAL_ID)
    if (!newId) continue
    const existing = await db.domainTemplates.get(newId)
    if (!existing) {
      await db.domainTemplates.put({ ...t, domain: newId })
    }
    await db.domainTemplates.delete(t.domain)
  }
}

// Απλοποίηση τομέων στόχων (8 βασικοί αναπτυξιακοί τομείς, από 14 αναλυτικούς πριν) — Product Design,
// βλ. config/domains.js. ΜΟΝΟ τα 9 legacy ids που πραγματικά συγχωνεύτηκαν σε νέο, διαφορετικό id·
// οι υπόλοιποι 5 (sensory, social-skills, emotional-development, self-care, behavior) κράτησαν το
// ΙΔΙΟ id — άλλαξε μόνο η ονομασία εμφάνισης, καμία ανάγκη μετάβασης δεδομένων γι' αυτούς.
//
// Idempotent και ασφαλές να τρέξει πολλές φορές: αγγίζει ΜΟΝΟ εγγραφές των οποίων το domain υπάρχει
// ρητά ως κλειδί εδώ — ήδη-νέα ids, τα 5 αμετάβλητα, ή οποιαδήποτε άγνωστη/μη αναγνωρισμένη τιμή
// περνάνε ΑΝΕΓΓΙΧΤΑ (μηδενική αλλοίωση, καμία υπόθεση/μάντεμα).
//
// Αγγίζει ΑΠΟΚΛΕΙΣΤΙΚΑ goals.domain και goalTemplates.domain (ρητή απόφαση χρήστη) — ΠΟΤΕ
// students.functionalProfile, το οποίο παραμένει σκόπιμα στους 14 αναλυτικούς τομείς
// (config/functionalProfileDomains.js, πλήρως ανεξάρτητο).
//
// Ατομικό: goals ΚΑΙ goalTemplates μεταφέρονται μέσα στην ΙΔΙΑ db.transaction — αδύνατο να μείνουν
// σε ενδιάμεση κατάσταση (τα goals μεταφερμένα αλλά τα templates όχι, ή αντίστροφα).
const GOAL_DOMAIN_ID_REMAP = {
  'fine-motor': 'mobility',
  'gross-motor': 'mobility',
  attention: 'cognitive',
  'executive-functions': 'cognitive',
  math: 'cognitive',
  'phonological-awareness': 'communication',
  reading: 'communication',
  writing: 'communication',
  'oral-language': 'communication'
}

// Επιστρέφει πόσες εγγραφές πραγματικά άλλαξαν (για το completion report) — ΟΧΙ undefined/void,
// ώστε ο καλών να μπορεί να επιβεβαιώσει τι ακριβώς μεταφέρθηκε.
export async function migrateGoalDomainsToBroaderDomains() {
  let goalsMigrated = 0
  let templatesMigrated = 0

  await db.transaction('rw', db.goals, db.goalTemplates, async () => {
    const goals = await db.goals.toArray()
    for (const g of goals) {
      const newDomain = GOAL_DOMAIN_ID_REMAP[g.domain]
      if (!newDomain) continue
      await db.goals.update(g.id, { domain: newDomain })
      goalsMigrated++
    }

    const templates = await db.goalTemplates.toArray()
    for (const t of templates) {
      const newDomain = GOAL_DOMAIN_ID_REMAP[t.domain]
      if (!newDomain) continue
      await db.goalTemplates.update(t.id, { domain: newDomain })
      templatesMigrated++
    }
  })

  return { goalsMigrated, templatesMigrated }
}

// Πυρήνας migration για goals με την παλιά κατάσταση 'revised' (Sprint ≤6) → 'active', αφού το
// "revised" έπαψε να είναι κατάσταση και έγινε τύπος goalEvent (Product Design §3). Δέχεται τα
// tables ως παραμέτρους ώστε να δουλεύει είτε μέσα σε Dexie upgrade transaction (tx.table(...))
// είτε εκτός (db.goals/db.goalEvents) — βλ. wrapper migrateRevisedGoalStatusToActive παρακάτω.
// trigger:'migration' (όχι 'manual') ώστε να μην παρουσιάζεται ποτέ σαν κανονική ενέργεια χρήστη.
async function migrateRevisedGoalStatusCore(goalsTable, goalEventsTable) {
  const revisedGoals = await goalsTable.where('status').equals('revised').toArray()
  for (const g of revisedGoals) {
    const at = g.statusChangedAt || g.startDate || new Date().toISOString()
    await goalsTable.update(g.id, { status: 'active' })
    await goalEventsTable.add({
      goalId: g.id,
      at,
      type: 'revised',
      fromStatus: 'revised',
      toStatus: 'active',
      note: 'Μεταφέρθηκε αυτόματα από παλιά κατάσταση «Αναθεωρήθηκε» (migration Sprint 7)',
      trigger: 'migration'
    })
  }
}

// Idempotent wrapper του migrateRevisedGoalStatusCore για χρήση ΕΚΤΟΣ του Dexie upgrade hook —
// αποκλειστικά μετά από restoreFromBackup (utils/backup.js), όπου δεν συμβαίνει version
// transition. Ασφαλές να τρέξει πολλές φορές: αγγίζει μόνο goals με status ήδη 'revised'.
// Τυλιγμένο στη δική του db.transaction ώστε να είναι ατομικό και εκτός upgrade context — αν
// κληθεί μέσα από ήδη ενεργή Dexie transaction (π.χ. restoreFromBackup), η Dexie αναγνωρίζει το
// ambient context και ΣΥΜΜΕΤΕΧΕΙ στην ίδια transaction αντί να δημιουργήσει nested· αν κληθεί
// standalone, δημιουργεί τη δική της. Και στις δύο περιπτώσεις: όλα-ή-τίποτα.
export async function migrateRevisedGoalStatusToActive() {
  await db.transaction('rw', db.goals, db.goalEvents, async () => {
    await migrateRevisedGoalStatusCore(db.goals, db.goalEvents)
  })
}

// Πυρήνας συμπλήρωσης goalEvents για goals που δημιουργήθηκαν πριν υπάρξει αυτός ο πίνακας
// (Sprint ≤6). Δημιουργεί ΜΟΝΟ ό,τι προκύπτει με ασφάλεια από υπάρχοντα δεδομένα — καμία
// ανακατασκευή ενδιάμεσων μεταβάσεων που δεν είναι πραγματικά γνωστές (Product Design §14):
//   - 1 συνθετικό 'created' event από το startDate, αν δεν υπάρχει ήδη ένα.
//   - αν status !== 'active' ΚΑΙ δεν υπάρχει ήδη κανένα statusChanged/revised event, 1 επιπλέον
//     συνθετικό 'statusChanged' event από το statusChangedAt (πιο αξιόπιστο διαθέσιμο timestamp).
// Οι δύο έλεγχοι είναι ανεξάρτητοι σκόπιμα: ένα goal που μόλις μεταφέρθηκε από 'revised' (βλ.
// migrateRevisedGoalStatusCore παραπάνω) έχει ήδη ένα 'revised' event αλλά ΟΧΙ ακόμα 'created'.
async function backfillGoalEventsCore(goalsTable, goalEventsTable) {
  const goals = await goalsTable.toArray()
  for (const g of goals) {
    const events = await goalEventsTable.where('goalId').equals(g.id).toArray()

    const hasCreated = events.some((e) => e.type === 'created')
    if (!hasCreated) {
      await goalEventsTable.add({
        goalId: g.id,
        at: g.startDate ? new Date(g.startDate).toISOString() : new Date().toISOString(),
        type: 'created',
        fromStatus: null,
        toStatus: 'active',
        note: 'Συμπληρώθηκε αυτόματα κατά τη μετάβαση σε Sprint 7 — δεν υπήρχε πριν αυτό τον πίνακα',
        trigger: 'migration'
      })
    }

    const hasStatusRecord = events.some((e) => e.type === 'statusChanged' || e.type === 'revised')
    if (g.status !== 'active' && !hasStatusRecord) {
      await goalEventsTable.add({
        goalId: g.id,
        at: g.statusChangedAt || (g.startDate ? new Date(g.startDate).toISOString() : new Date().toISOString()),
        type: 'statusChanged',
        fromStatus: null,
        toStatus: g.status,
        note: 'Συμπληρώθηκε αυτόματα κατά τη μετάβαση σε Sprint 7 — άγνωστη πραγματική ημερομηνία αλλαγής',
        trigger: 'migration'
      })
    }
  }
}

// Idempotent wrapper του backfillGoalEventsCore για χρήση ΕΚΤΟΣ του Dexie upgrade hook —
// αποκλειστικά μετά από restoreFromBackup. Ασφαλές να τρέξει πολλές φορές. Ίδιο ambient-transaction
// σκεπτικό με το migrateRevisedGoalStatusToActive παραπάνω.
export async function backfillGoalEvents() {
  await db.transaction('rw', db.goals, db.goalEvents, async () => {
    await backfillGoalEventsCore(db.goals, db.goalEvents)
  })
}

// Γεμίζει με seed data μόνο τους τομείς που δεν έχουν ακόμα template στη βάση
// (πρώτη εκκίνηση, ή νέος τομέας που προστέθηκε αργότερα στο domains.js).
//
// Sprint 5A Phase 2, Commit 4C — routed στην ενεργή γενιά (βλ. Commit 4B review). ΣΤΗ legacy
// γενιά ΜΗΔΕΝΙΚΗ αλλαγή: το domain παραμένει το ίδιο primary key, όπως πάντα. ΣΤΗ v2 γενιά,
// domain ΔΕΝ είναι πλέον primary key (βλ. db.version(11) — 'id, domain', ρητή απόφαση Commit 1
// ώστε το domain name να μην χρειάζεται να είναι global μοναδικό) — χρειάζεται λοιπόν δικό του
// 'id'. ΕΠΙΤΗΔΕΣ ΟΧΙ withNewRowId() (τυχαίο) εδώ: ένα ξανατρέξιμο seeding (π.χ. μετά από νέο domain
// στο config/domains.js) ΠΡΕΠΕΙ να παράγει το ΙΔΙΟ id για το ΙΔΙΟ domain κάθε φορά, αλλιώς το
// bulkPut θα πρόσθετε ΔΕΥΤΕΡΗ, διπλότυπη λογική εγγραφή αντί να αντικαταστήσει την πρώτη.
// Επαναχρησιμοποιεί το ΙΔΙΟ deterministicId(userId, tableName, key) με το migration engine
// (Σταθερό ανά (χρήστη, domain) — ΟΧΙ νέο, ξεχωριστό σχήμα) ώστε να μην υπάρχει ποτέ σύγκρουση με
// ένα ήδη-μεταφερμένο domainTemplates_v2 row για τον ΙΔΙΟ χρήστη/domain.
export async function ensureDomainTemplatesSeeded({ getUserId = currentUserIdOrNull } = {}) {
  const domainTemplatesTable = activeTable('domainTemplates')
  const existing = await domainTemplatesTable.toArray()
  const existingIds = new Set(existing.map((t) => t.domain))
  const missing = DOMAINS.filter((d) => !existingIds.has(d.id))
  if (missing.length === 0) return

  const isV2 = getCachedGeneration() === 'v2'
  let userId = null
  if (isV2) {
    // Fail-closed (review): ΚΑΜΙΑ εγγραφή αν δεν υπάρχει έγκυρο, μη-κενό userId — ένα
    // deterministicId(null/'', ...) θα παρήγαγε ένα «id» χωρίς πραγματικό νόημα ιδιοκτησίας,
    // δομικά αδύνατο να ταιριάξει μελλοντικά με τα ΣΩΣΤΑ deterministic ids αυτού του χρήστη.
    // Ελέγχεται ΕΔΩ, πριν από ΚΑΘΕ deterministicId()/bulkPut κλήση — μηδενική εγγραφή στην αποτυχία.
    userId = getUserId()
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new Error(
        'ensureDomainTemplatesSeeded: απαιτείται έγκυρο, μη κενό userId στη γενιά v2 για τον ' +
        'υπολογισμό των deterministic seed ids — καμία εγγραφή δεν πραγματοποιήθηκε.'
      )
    }
  }

  const rows = await Promise.all(missing.map(async ({ id }) => {
    const fields = {
      domain: id,
      suggestedMeasurementTypes: DOMAIN_TEMPLATES_SEED[id]?.suggestedMeasurementTypes || [],
      commonCriteria: DOMAIN_TEMPLATES_SEED[id]?.commonCriteria || [],
      baselineExamples: DOMAIN_TEMPLATES_SEED[id]?.baselineExamples || [],
      goalStarters: DOMAIN_TEMPLATES_SEED[id]?.goalStarters || []
    }
    if (!isV2) return fields
    return { id: await deterministicId(userId, 'domainTemplates', id), ...fields }
  }))

  await domainTemplatesTable.bulkPut(rows)
}

// Οριστική διαγραφή μαθητή και ΟΛΩΝ των δεδομένων του (goals, measurements, observations).
// Οι ομαδικές συνεδρίες δεν διαγράφονται — αφαιρείται μόνο ο μαθητής από τη συνεδρία, εκτός
// αν έμενε μόνος του σε αυτήν, οπότε η συνεδρία διαγράφεται κι εκείνη (δεν έχει πια νόημα).
export async function deleteStudent(studentId) {
  const studentsTable = activeTable('students')
  const goalsTable = activeTable('goals')
  const measurementsTable = activeTable('measurements')
  const observationsTable = activeTable('observations')
  const sessionsTable = activeTable('sessions')
  const scheduleSlotsTable = activeTable('scheduleSlots')
  const sessionGoalAssessmentsTable = activeTable('sessionGoalAssessments')

  await db.transaction('rw', [studentsTable, goalsTable, measurementsTable, observationsTable, sessionsTable, scheduleSlotsTable, sessionGoalAssessmentsTable], async () => {
    await goalsTable.where('studentId').equals(studentId).delete()
    await measurementsTable.where('studentId').equals(studentId).delete()
    await observationsTable.where('studentId').equals(studentId).delete()
    // Ίδιο σκεπτικό με τα measurements παραπάνω — μια κλινική εκτίμηση χωρίς τον μαθητή της δεν έχει νόημα.
    await sessionGoalAssessmentsTable.where('studentId').equals(studentId).delete()

    // studentIds δεν είναι indexed (πίνακας) — φιλτράρισμα στη μνήμη αντί για .where().
    const allSessions = await sessionsTable.toArray()
    const sessions = allSessions.filter((s) => s.studentIds?.includes(studentId))
    for (const session of sessions) {
      const studentIds = session.studentIds.filter((id) => id !== studentId)
      if (studentIds.length === 0) {
        await sessionsTable.delete(session.id)
      } else {
        const absentStudentIds = (session.absentStudentIds || []).filter((id) => id !== studentId)
        await sessionsTable.update(session.id, { studentIds, absentStudentIds })
      }
    }

    // Ίδιο σκεπτικό με τα sessions παραπάνω, εφαρμοσμένο στην ΤΡΕΧΟΥΣΑ έκδοση κάθε σειράς
    // προγράμματος (Sprint 6) — παλιότερες εκδόσεις (ιστορικό) δεν αγγίζονται.
    const allSlots = await scheduleSlotsTable.toArray()
    const slots = allSlots.filter((s) => s.studentIds?.includes(studentId))
    for (const slot of slots) {
      const studentIds = slot.studentIds.filter((id) => id !== studentId)
      if (studentIds.length === 0) {
        await scheduleSlotsTable.update(slot.id, { active: false })
      } else {
        await scheduleSlotsTable.update(slot.id, { studentIds })
      }
    }

    await studentsTable.delete(studentId)
  })
}

// Διαγραφή συνεδρίας: οι μετρήσεις της διαγράφονται μαζί της (δεν έχουν νόημα χωρίς τη συνεδρία
// που τις παρήγαγε). Οι παρατηρήσεις που τυχόν συνδέονται με sessionId ΔΕΝ διαγράφονται — μόνο
// αποσυνδέονται (sessionId: null) — παραμένουν έγκυρο ιστορικό γεγονός ακόμα κι αν η συνεδρία
// διαγραφεί (π.χ. λανθασμένη καταχώρηση).
export async function deleteSession(sessionId) {
  const sessionsTable = activeTable('sessions')
  const measurementsTable = activeTable('measurements')
  const observationsTable = activeTable('observations')
  const sessionGoalAssessmentsTable = activeTable('sessionGoalAssessments')

  await db.transaction('rw', [sessionsTable, measurementsTable, observationsTable, sessionGoalAssessmentsTable], async () => {
    await measurementsTable.where('sessionId').equals(sessionId).delete()
    // Ίδιο σκεπτικό με τα measurements παραπάνω — μια κλινική εκτίμηση χωρίς τη συνεδρία της δεν έχει νόημα.
    await sessionGoalAssessmentsTable.where('sessionId').equals(sessionId).delete()
    // sessionId δεν είναι indexed πεδίο στο observations (μόνο studentId/date) — φιλτράρισμα στη
    // μνήμη αντί για .where(), ίδιο μοτίβο με το deleteStudent() παραπάνω.
    const allObservations = await observationsTable.toArray()
    const linkedObservations = allObservations.filter((o) => o.sessionId === sessionId)
    for (const o of linkedObservations) {
      await observationsTable.update(o.id, { sessionId: null })
    }
    await sessionsTable.delete(sessionId)
  })
}

// ---------------------------------------------------------------------------------------------
// Sprint 6 — Πρόγραμμα εκπαιδευτικού & ημερολόγιο
// ---------------------------------------------------------------------------------------------

// Δημιουργεί την ΠΡΩΤΗ έκδοση μιας νέας επαναλαμβανόμενης ανάθεσης. Two-step: το seriesId μιας
// σειράς είναι το ίδιο το id της πρώτης της έκδοσης — χρειάζεται να ξέρουμε το id πριν το ορίσουμε.
export async function createScheduleSlot({ dayOfWeek, startTime, durationMinutes, type, studentIds, label }) {
  const scheduleSlotsTable = activeTable('scheduleSlots')
  const id = await scheduleSlotsTable.add(withNewRowId({
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
  }))
  await scheduleSlotsTable.update(id, { seriesId: id })
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
  const scheduleSlotsTable = activeTable('scheduleSlots')
  const current = await scheduleSlotsTable.get(currentSlotId)
  if (!current) return
  const today = todayLocalISO()
  const newEffectiveFrom = effectiveMode === 'date' ? effectiveDate : today

  if (current.effectiveFrom === today && newEffectiveFrom === today) {
    await scheduleSlotsTable.update(currentSlotId, changes)
    return
  }

  const { id: _oldId, ...currentWithoutId } = current
  await db.transaction('rw', scheduleSlotsTable, async () => {
    await scheduleSlotsTable.update(currentSlotId, { effectiveUntil: addDays(newEffectiveFrom, -1) })
    await scheduleSlotsTable.add(withNewRowId({
      ...currentWithoutId,
      ...changes,
      seriesId: current.seriesId,
      effectiveFrom: newEffectiveFrom,
      effectiveUntil: null
    }))
  })
}

// Παύση/επανενεργοποίηση — άμεση, in-place, ΧΩΡΙΣ effective-dating (αναστρέψιμο tap, όχι
// «αλλαγή προγράμματος» — Product Design: «προσωρινή απενεργοποίηση χωρίς οριστική διαγραφή»).
export async function pauseScheduleSlot(currentSlotId, active) {
  await activeTable('scheduleSlots').update(currentSlotId, { active })
}

// «Διαγραφή» ενός slot = τερματισμός της σειράς από μια ημερομηνία και μετά (effectiveUntil στην
// τρέχουσα έκδοση) — ΠΟΤΕ πραγματική διαγραφή γραμμών, ώστε το ιστορικό (Session.slotId) να μην
// χάνει ποτέ σημείο αναφοράς. Ίδιο «Από πότε ισχύει;» ερώτημα με την επεξεργασία.
export async function endScheduleSlotSeries(currentSlotId, effectiveMode, effectiveDate) {
  const scheduleSlotsTable = activeTable('scheduleSlots')
  const current = await scheduleSlotsTable.get(currentSlotId)
  if (!current) return
  const today = todayLocalISO()
  const stopFrom = effectiveMode === 'date' ? effectiveDate : today
  await scheduleSlotsTable.update(currentSlotId, { effectiveUntil: addDays(stopFrom, -1) })
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
  const scheduleSlotsTable = activeTable('scheduleSlots')
  const today = todayLocalISO()
  const allSlots = await scheduleSlotsTable.toArray()
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
      await scheduleSlotsTable.update(slot.id, { effectiveUntil: addDays(today, -1) })
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
  const dailyQueueTable = activeTable('dailyQueue')
  const sessionsTable = activeTable('sessions')
  const entries = await dailyQueueTable.where('date').aboveOrEqual(today).toArray()
  const affectedDates = new Set()

  for (const entry of entries) {
    if (entry.scheduleSeriesId == null || !closedSet.has(entry.scheduleSeriesId)) continue // χειροκίνητη ή άσχετη σειρά — ΔΕΝ αγγίζεται
    const sessionsOnDate = await sessionsTable.where('date').equals(entry.date).toArray()
    if (matchedSession(entry, sessionsOnDate)) continue // πραγματικό ιστορικό (completed/notHeld) — ΔΕΝ αγγίζεται
    await dailyQueueTable.delete(entry.id)
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
  return activeTable('sessions').add(withNewRowId({
    date,
    studentIds,
    status: 'notHeld',
    absentStudentIds: [],
    durationMinutes: null,
    activity: '',
    note: note || '',
    moods: {}
  }))
}

// Ενιαία «Επαναφορά στη σειρά» (Product Design, τελευταίος γύρος) — καλύπτει ΚΑΙ το skip (Sprint 5)
// ΚΑΙ το notHeld (Sprint 6) με το ίδιο κουμπί: αν η γραμμή ήταν skipped, γυρίζει σε pending· αν
// υπάρχει notHeld συνεδρία που ταιριάζει, διαγράφεται — ΠΟΤΕ και τα δύο ταυτόχρονα, η γραμμή είτε
// είναι skipped είτε έχει matching συνεδρία, ποτέ κάτι άλλο. Αν τελικά πραγματοποιηθεί αργότερα,
// θα υπάρξει ΜΙΑ και μοναδική πραγματική Session (η notHeld έχει ήδη εξαφανιστεί).
export async function restoreDailyQueueEntry(entry) {
  if (entry.status === 'skipped') {
    await activeTable('dailyQueue').update(entry.id, { status: 'pending' })
    return
  }
  const sessionsTable = activeTable('sessions')
  const sessionsOnDate = await sessionsTable.where('date').equals(entry.date).toArray()
  const notHeld = sessionsOnDate.find((s) => s.status === 'notHeld' && sameStudentSet(s.studentIds, entry.studentIds))
  if (notHeld) {
    await sessionsTable.delete(notHeld.id)
  }
}

// Ακύρωση/μετακίνηση ΜΙΑΣ εμφάνισης συγκεκριμένης ημερομηνίας (Technical Plan §4, §1 τελευταίου
// γύρου) — ΠΑΝΤΑ καταγράφεται ScheduleException, ανεξάρτητα από το αν η ημέρα-πηγή έχει ήδη
// παραχθεί. Αν έχει ήδη παραχθεί (υπάρχει ήδη γραμμή dailyQueue γι' αυτή τη σειρά σε αυτή την
// ημερομηνία), η γραμμή «κλείνει» ΑΜΕΣΩΣ μέσω notHeld συνεδρίας — ίδιος μηχανισμός με το χειροκίνητο
// «Δεν πραγματοποιήθηκε», όχι διαγραφή της γραμμής. Για μετακίνηση, στιγμιότυπο (snapshot) του
// περιεχομένου του slot ΤΗ ΣΤΙΓΜΗ της μετακίνησης — όχι ζωντανή αναφορά (§4).
//
// Phase 2 Stage B — «Αλλαγή ώρας» μίας ημερομηνίας: ΕΠΕΚΤΑΣΗ του ήδη υπάρχοντος 'moved' αντί για
// νέο τύπο (review: ίδια ΑΚΡΙΒΩΣ μηχανική — snapshot override σε μία ημερομηνία — απλά με
// newDate === originalDate). Ο resolver (scheduleResolution.js) ΉΔΗ χειρίζεται αυτή την περίπτωση
// σωστά χωρίς καμία δική του αλλαγή: όταν originalDate === newDate, η σειρά αποκλείεται ΚΑΙ
// ξαναπροστίθεται από το ΙΔΙΟ exception (suppress+re-add), καταλήγοντας σε ΑΚΡΙΒΩΣ μία εμφάνιση με
// τη νέα ώρα — καμία αλλαγή στο σχήμα/στη λογική επίλυσης χρειάστηκε.
//
// newStartTime (προαιρετικό): μόνο για αλλαγή-ώρας-ίδιας-ημέρας — αντικαθιστά τη snapshotted ώρα.
// Σε αυτή την περίπτωση η εμφάνιση ΣΥΝΕΧΙΖΕΙ να πραγματοποιείται σήμερα (ΔΕΝ είναι notHeld) — αν η
// ημέρα έχει ήδη παραχθεί, ενημερώνεται απευθείας η γραμμή dailyQueue (το plannedTime είναι
// στιγμιότυπο στη δημιουργία, βλ. σχόλιο db.js v7/v8 — δεν ξαναϋπολογίζεται μόνο του).
export async function applyScheduleException({ type, seriesId, originalDate, newDate, newStartTime, reason }) {
  const isSameDayTimeChange = type === 'moved' && newDate === originalDate

  let snapshot = {}
  if (type === 'moved') {
    const versions = await activeTable('scheduleSlots').where('seriesId').equals(seriesId).toArray()
    const active = versions.find(
      (v) => v.effectiveFrom <= originalDate && (!v.effectiveUntil || v.effectiveUntil >= originalDate)
    )
    if (active) {
      snapshot = {
        studentIds: active.studentIds,
        slotType: active.type,
        startTime: isSameDayTimeChange && newStartTime ? newStartTime : active.startTime,
        durationMinutes: active.durationMinutes,
        label: active.label
      }
    }
  }

  await activeTable('scheduleExceptions').add(withNewRowId({
    seriesId,
    originalDate,
    type,
    newDate: newDate || null,
    reason: reason || '',
    ...snapshot
  }))

  if (isSameDayTimeChange) {
    const dailyQueueTable = activeTable('dailyQueue')
    const originEntries = await dailyQueueTable.where('date').equals(originalDate).toArray()
    const originEntry = originEntries.find((e) => e.scheduleSeriesId === seriesId)
    if (originEntry && newStartTime) {
      await dailyQueueTable.update(originEntry.id, { plannedTime: newStartTime })
    }
    return
  }

  const originEntries = await activeTable('dailyQueue').where('date').equals(originalDate).toArray()
  const originEntry = originEntries.find((e) => e.scheduleSeriesId === seriesId)
  if (originEntry) {
    const sessionsOnDate = await activeTable('sessions').where('date').equals(originalDate).toArray()
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
  const scheduleSlotsTable = activeTable('scheduleSlots')
  const scheduleExceptionsTable = activeTable('scheduleExceptions')
  const dailyQueueTable = activeTable('dailyQueue')

  await db.transaction('rw', [scheduleSlotsTable, scheduleExceptionsTable, dailyQueueTable], async () => {
    const [scheduleSlots, scheduleExceptions, existingEntries] = await Promise.all([
      scheduleSlotsTable.toArray(),
      scheduleExceptionsTable.toArray(),
      dailyQueueTable.where('date').equals(date).toArray()
    ])

    const occurrences = resolveOccurrencesForDate(date, { scheduleSlots, scheduleExceptions })
    const existingSeriesIds = new Set(existingEntries.map((e) => e.scheduleSeriesId).filter((id) => id != null))
    const toInsert = occurrences.filter((o) => !existingSeriesIds.has(o.seriesId))
    if (toInsert.length === 0) return

    let nextOrder = existingEntries.reduce((max, e) => Math.max(max, e.order), -1) + 1
    await dailyQueueTable.bulkAdd(
      toInsert.map((o) => withNewRowId({
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
    activeTable('scheduleSlots').toArray(),
    activeTable('scheduleExceptions').toArray()
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

// ---------------------------------------------------------------------------------------------
// Sprint 7 — Goal lifecycle (Technical Plan Στάδιο 2)
// ---------------------------------------------------------------------------------------------

// Επιτρεπτές μεταβάσεις κατάστασης στόχου (Product Design §3 — state diagram). ΚΑΜΙΑ κατάσταση
// δεν αναφέρει τον εαυτό της ως επιτρεπτό στόχο (καμία «active → active»), άρα ίδια-κατάσταση
// «μεταβάσεις» απορρίπτονται αυτόματα από τον ίδιο έλεγχο με τις γνήσια μη επιτρεπτές μεταβάσεις,
// χωρίς ξεχωριστό ειδικό κλάδο κώδικα — βλ. transitionGoalStatus παρακάτω.
const GOAL_STATUS_TRANSITIONS = {
  active: ['paused', 'achieved', 'archived'],
  paused: ['active', 'achieved', 'archived'],
  achieved: ['active'],
  archived: ['active']
}

const VALID_GOAL_STATUSES = Object.keys(GOAL_STATUS_TRANSITIONS)

// Μοναδική πηγή αλήθειας για «ποιες καταστάσεις μπορεί να επιλέξει ο χρήστης από εδώ» — το
// GoalStatusModal (Στάδιο 3) καλεί ΑΠΟΚΛΕΙΣΤΙΚΑ αυτή τη συνάρτηση, ποτέ δικό του αντίγραφο του
// GOAL_STATUS_TRANSITIONS. Επιστρέφει άδειο array (όχι undefined/throw) για άγνωστη κατάσταση,
// ώστε το UI να μπορεί να το χρησιμοποιήσει άφοβα χωρίς προηγούμενο έλεγχο.
export function getAllowedGoalStatusTransitions(fromStatus) {
  return GOAL_STATUS_TRANSITIONS[fromStatus] || []
}

// Πυρήνας — tx-aware (δέχεται τα tables ως παραμέτρους, ίδιο idiom με τα core migration functions
// του Σταδίου 1) ώστε το Στάδιο 9 (applySchoolYearTransition) να μπορεί να το καλέσει ΜΕΣΑ σε μια
// μεγαλύτερη, ήδη ανοιχτή συναλλαγή αντί να ανοίξει η καθεμιά τη ΔΙΚΗ της (Dexie δεν κάνει true
// nested transactions — θα σειριοποιούνταν, όχι θα συμμετείχαν στην ίδια ατομικότητα).
async function transitionGoalStatusCore(goalsTable, goalEventsTable, goalId, toStatus, { note = '', trigger = 'manual', sessionId = null } = {}) {
  const goal = await goalsTable.get(goalId)
  if (!goal) {
    throw new Error(`Δεν βρέθηκε στόχος με id=${goalId}`)
  }

  const fromStatus = goal.status
  const allowedTargets = GOAL_STATUS_TRANSITIONS[fromStatus] || []
  if (!allowedTargets.includes(toStatus)) {
    throw new Error(`Η μετάβαση από «${fromStatus}» σε «${toStatus}» δεν επιτρέπεται (goal id=${goalId})`)
  }

  await goalsTable.update(goalId, { status: toStatus, statusChangedAt: new Date().toISOString() })
  await goalEventsTable.add(withNewRowId({
    goalId,
    at: new Date().toISOString(),
    type: 'statusChanged',
    fromStatus,
    toStatus,
    note,
    trigger,
    // Προαιρετικό, ΜΗ indexed πεδίο (καμία ανάγκη db.version bump — η Dexie/IndexedDB δεν απαιτεί
    // δηλωμένο schema για μη-indexed πεδία). Γεμίζει ΜΟΝΟ όταν trigger==='teachingMode' (βλ.
    // TeachingMode.jsx/handleSaveSession) — επιτρέπει στο utils/goalHistory.js να ταιριάξει αξιόπιστα
    // μια «Κατακτήθηκε» κλινική εκτίμηση με το ΙΔΙΟ αυτό goalEvent (ίδια συνεδρία), αντί για εύθραυστο
    // ταίριασμα βάσει ημερομηνίας (μια backdated συνεδρία θα είχε διαφορετικό sessions.date από το
    // πραγματικό at παραπάνω). null σε κάθε άλλη μετάβαση (GoalStatusModal, migrations, σχολικό έτος).
    sessionId
  }))
}

// transitionGoalStatus είναι το ΜΟΝΑΔΙΚΟ δημόσιο API για αλλαγή κατάστασης στόχου — κανένα άλλο
// σημείο του κώδικα δεν πρέπει να κάνει goal.status=... / db.goals.update(...,{status}) απευθείας.
//
// Ατομικό: η ενημέρωση goals.status ΚΑΙ η δημιουργία του αντίστοιχου goalEvents γίνονται μέσα
// στην ΙΔΙΑ db.transaction — αδύνατο να αλλάξει η κατάσταση χωρίς να καταγραφεί το γεγονός που
// την εξηγεί (βλ. rollback test στο db.test.js).
//
// Καθορισμένη συμπεριφορά σε μη έγκυρη είσοδο (ρητά ζητηθέν, όχι σιωπηλό no-op):
//   - toStatus άγνωστη τιμή            → throw, καμία επαφή με τη βάση καν.
//   - goalId δεν αντιστοιχεί σε goal   → throw μέσα στη συναλλαγή, καμία εγγραφή.
//   - ίδια κατάσταση (π.χ. active→active) → throw (πιάνεται φυσικά ως «μη επιτρεπτή μετάβαση»,
//     αφού καμία κατάσταση δεν περιλαμβάνει τον εαυτό της στους επιτρεπτούς στόχους της).
//   - μη επιτρεπτή μετάβαση (π.χ. achieved→archived) → throw.
export async function transitionGoalStatus(goalId, toStatus, opts = {}) {
  if (!VALID_GOAL_STATUSES.includes(toStatus)) {
    throw new Error(`Άγνωστη κατάσταση στόχου: «${toStatus}»`)
  }

  const goalsTable = activeTable('goals')
  const goalEventsTable = activeTable('goalEvents')
  await db.transaction('rw', goalsTable, goalEventsTable, async () => {
    await transitionGoalStatusCore(goalsTable, goalEventsTable, goalId, toStatus, opts)
  })
}

// Πυρήνας — tx-aware, ίδιο σκεπτικό με το transitionGoalStatusCore παραπάνω. trigger εκτίθεται ως
// παράμετρος (προεπιλογή 'manual', ίδια συμπεριφορά με πριν) ώστε το applySchoolYearTransition
// (Στάδιο 9) να μπορεί να σημαδέψει ρητά τα goals που δημιουργούνται μέσα στο wizard ως
// trigger:'schoolYearWizard' — ίδια αρχή με το trigger:'migration' του Σταδίου 1.
async function createGoalCore(goalsTable, goalEventsTable, fields, trigger = 'manual') {
  const now = new Date().toISOString()
  const preparedFields = { ...fields }
  // Δομημένο κριτήριο (Goal Wizard Step 3 redesign, Technical Plan Στάδιο 1) — προαιρετικό ΠΡΟΣ ΤΟ
  // ΠΑΡΟΝ, αφού ο Wizard δεν το στέλνει ακόμα (θα συνδεθεί στα Στάδια 3+). Όταν υπάρχει, είναι η
  // ΜΟΝΑΔΙΚΗ πηγή αλήθειας: επικυρώνεται ΠΡΙΝ την εγγραφή και παράγει αυτόματα το εμφανιζόμενο
  // goal.criterion — ό,τι κείμενο τυχόν στάλθηκε απευθείας αγνοείται σκόπιμα εδώ (ίδιο σκεπτικό με
  // το status/statusChangedAt παρακάτω). Χωρίς criterionConfig, η συμπεριφορά είναι ΑΚΡΙΒΩΣ η
  // σημερινή — ελεύθερο κείμενο criterion όπως στάλθηκε, μηδενική αλλαγή για υπάρχοντες callers.
  if (preparedFields.criterionConfig) {
    validateCriterionConfig(preparedFields.measurementType, preparedFields.criterionConfig)
    preparedFields.criterion = generateCriterionText(preparedFields.measurementType, preparedFields.criterionConfig)
  }
  const goalId = await goalsTable.add(withNewRowId({ ...preparedFields, status: 'active', statusChangedAt: now }))
  await goalEventsTable.add(withNewRowId({
    goalId,
    at: now,
    type: 'created',
    fromStatus: null,
    toStatus: 'active',
    note: '',
    trigger
  }))
  return goalId
}

// Κεντρικοποιημένη δημιουργία στόχου (αντικαθιστά το απευθείας db.goals.add του GoalWizardForm
// στο Στάδιο 4) — ίδιο σκεπτικό ατομικότητας με το transitionGoalStatus: το goal ΚΑΙ το αρχικό
// 'created' event δημιουργούνται στην ΙΔΙΑ συναλλαγή. Κάθε νέος στόχος ξεκινά ΠΑΝΤΑ 'active' —
// καμία «draft» κατάσταση (ρητά απορρίφθηκε στο Product Design ως λύση σε πρόβλημα που δεν
// τέθηκε) — το status/statusChangedAt εδώ υπερισχύουν σκόπιμα οτιδήποτε τυχόν περάσει ο καλών.
export async function createGoal(fields) {
  const goalsTable = activeTable('goals')
  const goalEventsTable = activeTable('goalEvents')
  return db.transaction('rw', goalsTable, goalEventsTable, async () => {
    return createGoalCore(goalsTable, goalEventsTable, fields)
  })
}

// Ενημερώνει ΑΠΟΚΛΕΙΣΤΙΚΑ το δομημένο κριτήριο ενός στόχου (criterionConfig/criterionNote) — ίδιο
// σκεπτικό επικύρωσης/αυτόματης παραγωγής κειμένου με το createGoalCore παραπάνω. Ο Wizard (Στάδιο
// 3+) θα το καλεί σε edit mode. ΔΕΝ αλλάζει measurementType — αυτό είναι ξεχωριστή, προστατευμένη
// ενέργεια (Technical Plan Στάδιο 3: απαγορεύεται σιωπηλή αλλαγή τύπου όταν υπάρχουν ήδη μετρήσεις).
// criterionNote είναι ΠΑΝΤΑ συμπληρωματικό κείμενο δίπλα στο αυτόματο criterion, ΠΟΤΕ δεν το
// αντικαθιστά ούτε επηρεάζει οποιαδήποτε λογική (απόφαση χρήστη, Product Design §3).
export async function updateGoalCriterion(goalId, { criterionConfig, criterionNote = '' }) {
  const goalsTable = activeTable('goals')
  return db.transaction('rw', goalsTable, async () => {
    const goal = await goalsTable.get(goalId)
    if (!goal) {
      throw new Error(`Δεν βρέθηκε στόχος με id=${goalId}`)
    }
    validateCriterionConfig(goal.measurementType, criterionConfig)
    const criterion = generateCriterionText(goal.measurementType, criterionConfig)
    await goalsTable.update(goalId, { criterionConfig, criterion, criterionNote })
  })
}

// ---------------------------------------------------------------------------------------------
// Sprint 7 — Σχολικά έτη & συμμετοχή μαθητών (Technical Plan Στάδιο 9· καμία οθόνη ακόμα — μόνο
// backend, θα καταναλωθεί από το Year Transition Wizard του Σταδίου 10 και τις Ρυθμίσεις του
// Σταδίου 11· η μόνη σύνδεση UI αυτού του σταδίου είναι το StudentProfile.jsx που καλεί πλέον
// setStudentActive αντί για db.students.update απευθείας).
// ---------------------------------------------------------------------------------------------

// ΣΗΜΑΝΤΙΚΟ (bugfix βρέθηκε κατά την υλοποίηση αυτού του σταδίου): boolean τιμές ΔΕΝ είναι έγκυρα
// IndexedDB keys (spec) — ένα .where('isActive').equals(true/1/...) πάνω στο ήδη-δηλωμένο index
// schoolYears.isActive (v9) πετάει DataError σε ΚΑΘΕ πραγματικό browser (επιβεβαιώθηκε εμπειρικά
// και με fake-indexeddb). Το ίδιο index ΔΕΝ αγγίζεται πουθενά παρακάτω — «ποιο έτος είναι ενεργό»
// φιλτράρεται πάντα στη μνήμη μετά από .toArray(), ίδιο idiom με το ήδη υπάρχον scheduleSlots.active
// (βλ. σχόλιο στο db.version(8) παραπάνω). Ασκόπιμη διόρθωση σχήματος (schema bump) αποφεύχθηκε
// επίτηδες — αφού το index απλά δεν χρησιμοποιείται ποτέ σε query, δεν προκαλεί ποτέ το πρόβλημα.
const VALID_PARTICIPATION_STATUSES = ['new', 'continued', 'departed', 'returned']

function assertValidSchoolYearFields({ label, startDate, endDate }) {
  if (!label || !label.trim()) {
    throw new Error('Ο τίτλος του σχολικού έτους είναι υποχρεωτικός.')
  }
  if (!startDate || !endDate) {
    throw new Error('Το σχολικό έτος χρειάζεται ημερομηνία έναρξης και ημερομηνία λήξης.')
  }
  if (startDate > endDate) {
    throw new Error('Η ημερομηνία έναρξης δεν μπορεί να είναι μετά την ημερομηνία λήξης.')
  }
}

// Δημιουργεί νέο σχολικό έτος — ΔΕΝ το ενεργοποιεί αυτόματα (σημείο 5, ρητά ζητηθέν: «δημιουργήθηκε
// νέο έτος αλλά δεν ενεργοποιήθηκε ακόμη» είναι μια έγκυρη, αναμενόμενη ενδιάμεση κατάσταση —
// π.χ. προετοιμασία του επόμενου έτους πριν έρθει η ώρα του). Χρήση setActiveSchoolYear ξεχωριστά.
export async function createSchoolYear({ label, startDate, endDate }) {
  assertValidSchoolYearFields({ label, startDate, endDate })
  return activeTable('schoolYears').add(withNewRowId({ label: label.trim(), startDate, endDate, isActive: false }))
}

// Το ενεργό σχολικό έτος, ή null αν κανένα δεν είναι ενεργό (έγκυρη κατάσταση πριν την αρχική
// ρύθμιση — σημείο 5). Φιλτράρισμα στη μνήμη — βλ. σχόλιο για το boolean-index bug παραπάνω.
export async function getActiveSchoolYear() {
  const all = await activeTable('schoolYears').toArray()
  return all.find((y) => y.isActive) || null
}

// Όλα τα σχολικά έτη, ταξινομημένα κατά startDate (αύξουσα) — η ΜΟΝΑΔΙΚΗ ασφαλής διαδρομή για να
// λίστα κανείς αυτόν τον πίνακα ταξινομημένο. Bugfix (πραγματικό browser smoke test, κλείσιμο
// Sprint 7): GoalsList.jsx και Settings.jsx έκαναν προηγουμένως το καθένα τη ΔΙΚΗ του
// db.schoolYears.orderBy('startDate') απευθείας — το startDate ΔΕΝ είναι indexed πεδίο σε αυτόν
// τον πίνακα (βλ. σχήμα: 'schoolYears: ++id, isActive'), οπότε το .orderBy() πετούσε Dexie
// SchemaError αμέσως μόλις άνοιγε οποιοδήποτε Student Profile (το GoalsList είναι πάντα mounted
// μέσα στα tabs, βλ. StudentProfile.jsx). ΚΑΝΕΝΑ component δεν πρέπει να καλεί .orderBy('startDate')
// σε αυτόν τον πίνακα απευθείας — μόνο μέσω αυτής της συνάρτησης, ίδιο idiom με το
// getActiveSchoolYear/isActive παραπάνω (πλήρες table scan + ταξινόμηση στη μνήμη — ο πίνακας θα
// έχει πάντα λίγες δεκάδες γραμμές, μηδαμινό κόστος).
export async function listSchoolYears() {
  return sortSchoolYearsByStartDate(await activeTable('schoolYears').toArray())
}

// Idempotent (σημείο 5): μετά από ΚΑΘΕ επιτυχημένη ολοκλήρωση υπάρχει ΑΚΡΙΒΩΣ ένα ενεργό έτος.
//   - id ανύπαρκτο                → throw, καμία εγγραφή.
//   - το έτος είναι ήδη το ενεργό → no-op επιτυχία (καμία περιττή εγγραφή/rewrite).
//   - διαφορετικά                 → μέσα στην ΙΔΙΑ συναλλαγή: απενεργοποιεί ό,τι τυχόν ήταν ενεργό
//     ΚΑΙ ενεργοποιεί το ζητούμενο — αδύνατο να μείνει ενδιάμεση κατάσταση με μηδέν ή δύο ενεργά έτη.
export async function setActiveSchoolYear(schoolYearId) {
  const schoolYearsTable = activeTable('schoolYears')
  await db.transaction('rw', schoolYearsTable, async () => {
    const target = await schoolYearsTable.get(schoolYearId)
    if (!target) {
      throw new Error(`Δεν βρέθηκε σχολικό έτος με id=${schoolYearId}`)
    }
    if (target.isActive) return

    const all = await schoolYearsTable.toArray()
    for (const y of all) {
      if (y.isActive && y.id !== schoolYearId) {
        await schoolYearsTable.update(y.id, { isActive: false })
      }
    }
    await schoolYearsTable.update(schoolYearId, { isActive: true })
  })
}

// Πυρήνας — tx-aware (ίδιο idiom με transitionGoalStatusCore/createGoalCore). ΣΥΝΟΨΗ συμμετοχής
// ανά μαθητή/έτος, ΟΧΙ πλήρες event log (σημείο 1 — ρητή απόφαση χρήστη, καταγράφεται εδώ): αν ο
// ίδιος μαθητής αρχειοθετηθεί/επανέλθει πολλές φορές μέσα στο ΙΔΙΟ σχολικό έτος, η μία εγγραφή
// (compound unique index [studentId+schoolYearId]) αντικατοπτρίζει ΜΟΝΟ την πιο πρόσφατη κατάσταση
// — ΔΕΝ κρατάει ιστορικό ενδιάμεσων αποχωρήσεων/επιστροφών εντός του ίδιου έτους. Αν χρειαστεί ποτέ
// πλήρες ιστορικό αυτού του είδους, θα χρειαστεί δικός του πίνακας event log (εκτός του παρόντος
// σταδίου) — το σημερινό unique schema δεν το επιτρέπει με ασφάλεια.
async function recordSchoolYearParticipationCore(participationTable, studentId, schoolYearId, status, reason) {
  if (!VALID_PARTICIPATION_STATUSES.includes(status)) {
    throw new Error(`Άγνωστη κατάσταση συμμετοχής: «${status}»`)
  }
  const recordedAt = new Date().toISOString()
  const existing = await participationTable.where('[studentId+schoolYearId]').equals([studentId, schoolYearId]).first()
  if (existing) {
    await participationTable.update(existing.id, { status, reason, recordedAt })
    return existing.id
  }
  return participationTable.add(withNewRowId({ studentId, schoolYearId, status, reason, recordedAt }))
}

// Δημόσιος wrapper — ελέγχει ρητά ότι μαθητής ΚΑΙ σχολικό έτος υπάρχουν (σημείο 4) πριν την
// upsert εγγραφή, ΜΕΣΑ στην ίδια συναλλαγή (ίδιο idiom με transitionGoalStatus/createGoal — ποτέ
// προ-συναλλαγής reads για validation).
export async function recordSchoolYearParticipation(studentId, schoolYearId, status, { reason = '' } = {}) {
  const studentsTable = activeTable('students')
  const schoolYearsTable = activeTable('schoolYears')
  const schoolYearParticipationTable = activeTable('schoolYearParticipation')
  return db.transaction('rw', studentsTable, schoolYearsTable, schoolYearParticipationTable, async () => {
    const student = await studentsTable.get(studentId)
    if (!student) {
      throw new Error(`Δεν βρέθηκε μαθητής με id=${studentId}`)
    }
    const schoolYear = await schoolYearsTable.get(schoolYearId)
    if (!schoolYear) {
      throw new Error(`Δεν βρέθηκε σχολικό έτος με id=${schoolYearId}`)
    }
    return recordSchoolYearParticipationCore(schoolYearParticipationTable, studentId, schoolYearId, status, reason)
  })
}

// Κεντρική, ΑΤΟΜΙΚΗ συνάρτηση αρχειοθέτησης/επαναφοράς μαθητή (σημείο 2) — αντικαθιστά το
// απευθείας db.students.update({active}) του StudentProfile.jsx. Η αλλαγή του student.active ΚΑΙ
// η αντίστοιχη ενημέρωση/δημιουργία schoolYearParticipation γίνονται στην ΙΔΙΑ συναλλαγή —
// αδύνατο να αλλάξει το ένα χωρίς το άλλο.
//
//   - idempotent: αν ο μαθητής είναι ήδη στη ζητούμενη κατάσταση, no-op (καμία εγγραφή πουθενά,
//     ούτε participation) — καλύπτει και μια «δεύτερη ίδια κλήση» χωρίς διπλότυπη participation.
//   - αν ΔΕΝ υπάρχει κανένα ενεργό σχολικό έτος (π.χ. πριν την αρχική ρύθμιση, σημείο 5): η αλλαγή
//     student.active συμβαίνει κανονικά· η participation ΔΕΝ αγγίζεται καθόλου — η αρχειοθέτηση
//     ενός μαθητή δεν πρέπει ΠΟΤΕ να μπλοκάρεται από την απουσία σχολικού έτους.
//   - αρχειοθέτηση (active: false → true is false): upsert participation με status 'departed'.
//   - επαναφορά (active: false → true): αν υπήρχε ήδη εγγραφή αυτό το έτος (π.χ. 'departed' από
//     νωρίτερα φέτος), γίνεται 'returned'· αλλιώς (πρώτη φορά ενεργός μέσα σε αυτό το έτος) 'new'.
export async function setStudentActive(studentId, active, { reason = '' } = {}) {
  const studentsTable = activeTable('students')
  const schoolYearsTable = activeTable('schoolYears')
  const schoolYearParticipationTable = activeTable('schoolYearParticipation')
  await db.transaction('rw', studentsTable, schoolYearsTable, schoolYearParticipationTable, async () => {
    const student = await studentsTable.get(studentId)
    if (!student) {
      throw new Error(`Δεν βρέθηκε μαθητής με id=${studentId}`)
    }
    if (student.active === active) return

    await studentsTable.update(studentId, { active })

    const allYears = await schoolYearsTable.toArray()
    const activeYear = allYears.find((y) => y.isActive)
    if (!activeYear) return

    if (!active) {
      await recordSchoolYearParticipationCore(schoolYearParticipationTable, studentId, activeYear.id, 'departed', reason)
    } else {
      const existing = await schoolYearParticipationTable
        .where('[studentId+schoolYearId]').equals([studentId, activeYear.id]).first()
      const nextStatus = existing ? 'returned' : 'new'
      await recordSchoolYearParticipationCore(schoolYearParticipationTable, studentId, activeYear.id, nextStatus, reason)
    }
  })
}

// Μόνο αυτές οι 3 τιμές γίνονται δεκτές ως απόφαση συμμετοχής ΜΕΣΑ σε μια μετάβαση έτους —
// στενότερο σύνολο από το γενικό VALID_PARTICIPATION_STATUSES (που περιλαμβάνει και 'new', μια
// έννοια που ανήκει στο setStudentActive/εγγραφή νέου μαθητή, όχι στη μετάβαση υπάρχοντος
// μαθητολογίου). recordSchoolYearParticipationCore παραμένει η δεύτερη, γενική γραμμή άμυνας.
const TRANSITION_PARTICIPATION_STATUSES = ['continued', 'departed', 'returned']

// Πυρήνας «φρέσκιας έκδοσης στο όριο του έτους» (Technical Plan Στάδιο 10, σημείο 7 — διευκρίνιση
// χρήστη: ΟΧΙ το copyScheduleDay, που είναι weekday→weekday· επαναχρησιμοποιεί το ΙΔΙΟ idiom
// εκδόσεων με το saveScheduleSlotEdit). Για κάθε ΤΡΕΧΟΥΣΑ σήμερα ενεργή έκδοση μιας σειράς
// scheduleSlots: κλείνει (effectiveUntil = παραμονή του newStartDate) και ανοίγει νέα έκδοση, ίδιο
// seriesId, effectiveFrom = newStartDate, ΧΩΡΙΣ τους αποχωρούντες μαθητές στο studentIds. Αν μια
// σειρά μένει χωρίς κανέναν απομένοντα μαθητή, απλά δεν ανοίγει νέα έκδοση (ισοδύναμο με τερματισμό
// της σειράς) — ΠΟΤΕ κενό studentIds σε ενεργή έκδοση.
//
// Idempotent (σημείο 7 — «όχι duplicates αν το submit επαναληφθεί»): αν μια σειρά ΗΔΗ έχει έκδοση
// με effectiveFrom === newStartDate (από προηγούμενη κλήση), παραλείπεται — δεν ανοίγει δεύτερη.
async function refreshScheduleSlotsForNewYearCore(scheduleSlotsTable, newStartDate, departedStudentIds) {
  const departedSet = new Set(departedStudentIds)
  const today = todayLocalISO()
  const allSlots = await scheduleSlotsTable.toArray()
  const currentVersions = allSlots.filter(
    (s) => s.active && s.effectiveFrom <= today && (!s.effectiveUntil || s.effectiveUntil >= today)
  )

  for (const version of currentVersions) {
    const alreadyRefreshed = allSlots.some((s) => s.seriesId === version.seriesId && s.effectiveFrom === newStartDate)
    if (alreadyRefreshed) continue

    const studentIds = version.studentIds.filter((id) => !departedSet.has(id))
    if (studentIds.length === 0) continue

    await scheduleSlotsTable.update(version.id, { effectiveUntil: addDays(newStartDate, -1) })
    await scheduleSlotsTable.add(withNewRowId({
      seriesId: version.seriesId,
      dayOfWeek: version.dayOfWeek,
      startTime: version.startTime,
      durationMinutes: version.durationMinutes,
      type: version.type,
      studentIds,
      label: version.label,
      active: true,
      effectiveFrom: newStartDate,
      effectiveUntil: null
    }))
  }
}

// Εφαρμόζει ΟΛΟΚΛΗΡΗ τη μετάβαση σε ΝΕΟ σχολικό έτος σε ΜΙΑ Dexie συναλλαγή, όλα-ή-τίποτα
// (Technical Plan Στάδιο 10, σημεία 1/2): δημιουργία ΚΑΙ ενεργοποίηση του νέου έτους, απενεργοποίηση
// του προηγούμενου, participation, student.active, goal transitions/cloning, goalEvents, ΚΑΙ
// προαιρετικά η ανανέωση προγράμματος — όλα μέσα στην ίδια συναλλαγή. Το wizard (Στάδιο 10 UI) ΔΕΝ
// καλεί ποτέ createSchoolYear()/setActiveSchoolYear() ξεχωριστά πριν από αυτό — η ΜΟΝΑΔΙΚΗ εγγραφή
// στη βάση γίνεται εδώ, στο τελικό submit. Ξαναχρησιμοποιεί τα tx-aware core functions
// (transitionGoalStatusCore/createGoalCore/recordSchoolYearParticipationCore) και το ήδη-transactional
// setActiveSchoolYear (η Dexie αναγνωρίζει το ambient context και συμμετέχει στην ΙΔΙΑ συναλλαγή,
// ίδιο idiom με το restoreFromBackup) — ΠΟΤΕ τα δημόσια transitionGoalStatus/createGoal, που θα
// άνοιγαν η καθεμιά τη ΔΙΚΗ της ξεχωριστή συναλλαγή.
//
// newYearFields: { label, startDate, endDate } — το ΝΕΟ έτος δημιουργείται εδώ. Άκυρα πεδία
// (assertValidSchoolYearFields) ΚΑΙ διπλότυπος τίτλος → throw πριν αγγιχτεί οτιδήποτε άλλο.
//
// goalDecisions: [{ goalId, studentId, decision: 'continue' | 'achieved' | 'newGoal', note, newGoalFields }]
//   - studentId περνιέται ΡΗΤΑ (όχι εξαγωγή από goal.studentId) ώστε το σημείο 4 («ο στόχος ανήκει
//     στον σωστό μαθητή») να ελέγχεται ενάντια στην πρόθεση του καλούντος.
//   - 'continue': καμία αλλαγή status, ΚΑΝΕΝΑ goalEvent — ΙΣΧΥΕΙ ΚΑΙ ΓΙΑ paused goals (Στάδιο 10,
//     σημείο 5: «Συνέχεια» σε paused goal ΔΕΝ σημαίνει επανενεργοποίηση, παραμένει paused χωρίς
//     κανένα status event — η σημασιολογία δεν αλλάζει σιωπηλά μόνο επειδή άλλαξε το σχολικό έτος).
//     Ρητή επανενεργοποίηση ενός paused goal γίνεται ΕΚΤΟΣ αυτού του wizard, μέσω του ήδη υπάρχοντος
//     GoalStatusModal (Στάδιο 3) — δεν είναι μία από τις 3 εγκεκριμένες επιλογές εδώ.
//   - 'achieved': transitionGoalStatusCore(...,'achieved', trigger:'schoolYearWizard').
//   - 'newGoal': ο ΥΠΑΡΧΩΝ στόχος αρχειοθετείται αυτόματα (transitionGoalStatusCore ...,'archived',
//     trigger:'schoolYearWizard') ΚΑΙ δημιουργείται νέος μέσω createGoalCore με baseline ΠΑΝΤΑ ''.
//   - ΚΑΝΕΝΑ goalDecision δεν επιτρέπεται για μαθητή που η participationDecisions του σημειώνει
//     'departed' (Στάδιο 10, σημείο 6) — throw, ΠΟΤΕ σιωπηλή αγνόηση.
//
// participationDecisions: [{ studentId, status, reason }], status ∈ TRANSITION_PARTICIPATION_STATUSES.
// Bundled ΜΑΖΙ με το student.active (σημείο 2, «ως ένα atomic operation»): 'departed' → active:false,
// 'continued'/'returned' → active:true· η κατάσταση ΓΡΑΦΕΤΑΙ ΡΗΤΑ όπως την αποφάσισε ο καλών (όχι
// αυτόματη εξαγωγή όπως στο setStudentActive — το wizard ήδη ξέρει αν είναι 'continued' ή 'returned').
//
// copySchedule: αν true, τρέχει επιπλέον το refreshScheduleSlotsForNewYearCore ΜΕΣΑ στην ΙΔΙΑ
// συναλλαγή (σημείο 7 — τίποτα δεν εμπόδιζε να είναι μέσα, αφού είναι απλές εγγραφές Dexie στον
// ίδιο μηχανισμό· καμία ανάγκη για ξεχωριστό, μεταγενέστερο βήμα).
//
// Validation ΠΡΙΝ αγγιχτεί οποιαδήποτε εγγραφή (σημείο 4) — τρία περάσματα (πεδία έτους → αποφάσεις
// συμμετοχής → αποφάσεις στόχων, με αυτή τη σειρά ώστε το goalDecisions-vs-departed έλεγχος να έχει
// ήδη το σύνολο των αποχωρούντων). Ολόκληρη η συνάρτηση τρέχει ήδη μέσα σε μία db.transaction, άρα
// ΚΑΘΕ throw ούτως ή άλλως κάνει πλήρες rollback — τα περάσματα υπάρχουν για ΣΑΦΗ, νωρίς errors.
export async function applySchoolYearTransition({ label, startDate, endDate }, { goalDecisions = [], participationDecisions = [], copySchedule = false } = {}) {
  const schoolYearsTable = activeTable('schoolYears')
  const studentsTable = activeTable('students')
  const goalsTable = activeTable('goals')
  const goalEventsTable = activeTable('goalEvents')
  const schoolYearParticipationTable = activeTable('schoolYearParticipation')
  const scheduleSlotsTable = activeTable('scheduleSlots')

  return db.transaction('rw', schoolYearsTable, studentsTable, goalsTable, goalEventsTable, schoolYearParticipationTable, scheduleSlotsTable, async () => {
    assertValidSchoolYearFields({ label, startDate, endDate })
    const trimmedLabel = label.trim()
    const existingWithLabel = (await schoolYearsTable.toArray()).find((y) => y.label === trimmedLabel)
    if (existingWithLabel) {
      throw new Error(`Υπάρχει ήδη σχολικό έτος με τίτλο «${trimmedLabel}»`)
    }

    const seenParticipationStudentIds = new Set()
    const departedStudentIds = new Set()
    for (const p of participationDecisions) {
      if (!TRANSITION_PARTICIPATION_STATUSES.includes(p.status)) {
        throw new Error(`Άγνωστη κατάσταση συμμετοχής για μετάβαση έτους: «${p.status}» (μαθητής id=${p.studentId})`)
      }
      if (seenParticipationStudentIds.has(p.studentId)) {
        throw new Error(`Διπλή απόφαση συμμετοχής για τον ίδιο μαθητή (id=${p.studentId})`)
      }
      seenParticipationStudentIds.add(p.studentId)
      const student = await studentsTable.get(p.studentId)
      if (!student) {
        throw new Error(`Δεν βρέθηκε μαθητής με id=${p.studentId}`)
      }
      if (p.status === 'departed') departedStudentIds.add(p.studentId)
    }

    const seenGoalIds = new Set()
    for (const d of goalDecisions) {
      if (!['continue', 'achieved', 'newGoal'].includes(d.decision)) {
        throw new Error(`Άγνωστη απόφαση στόχου: «${d.decision}» (goal id=${d.goalId})`)
      }
      if (seenGoalIds.has(d.goalId)) {
        throw new Error(`Διπλή απόφαση για τον ίδιο στόχο (goal id=${d.goalId})`)
      }
      seenGoalIds.add(d.goalId)

      const goal = await goalsTable.get(d.goalId)
      if (!goal) {
        throw new Error(`Δεν βρέθηκε στόχος με id=${d.goalId}`)
      }
      if (goal.studentId !== d.studentId) {
        throw new Error(`Ο στόχος id=${d.goalId} δεν ανήκει στον μαθητή id=${d.studentId}`)
      }
      const student = await studentsTable.get(d.studentId)
      if (!student) {
        throw new Error(`Δεν βρέθηκε μαθητής με id=${d.studentId} (στόχος id=${d.goalId})`)
      }
      if (departedStudentIds.has(d.studentId)) {
        throw new Error(`Ο μαθητής id=${d.studentId} αποχωρεί — δεν επιτρέπεται απόφαση για τον στόχο id=${d.goalId}`)
      }
      if (d.decision === 'newGoal' && !d.newGoalFields?.title?.trim()) {
        throw new Error(`Ο νέος στόχος (αντικατάσταση του id=${d.goalId}) χρειάζεται τίτλο`)
      }
    }

    const newSchoolYearId = await schoolYearsTable.add(withNewRowId({ label: trimmedLabel, startDate, endDate, isActive: false }))
    await setActiveSchoolYear(newSchoolYearId)

    for (const d of goalDecisions) {
      if (d.decision === 'continue') continue
      if (d.decision === 'achieved') {
        await transitionGoalStatusCore(goalsTable, goalEventsTable, d.goalId, 'achieved', { note: d.note || '', trigger: 'schoolYearWizard' })
      } else if (d.decision === 'newGoal') {
        await transitionGoalStatusCore(goalsTable, goalEventsTable, d.goalId, 'archived', { note: d.note || '', trigger: 'schoolYearWizard' })
        await createGoalCore(goalsTable, goalEventsTable, { ...d.newGoalFields, studentId: d.studentId, baseline: '' }, 'schoolYearWizard')
      }
    }

    for (const p of participationDecisions) {
      await studentsTable.update(p.studentId, { active: p.status !== 'departed' })
      await recordSchoolYearParticipationCore(schoolYearParticipationTable, p.studentId, newSchoolYearId, p.status, p.reason || '')
    }

    if (copySchedule) {
      await refreshScheduleSlotsForNewYearCore(scheduleSlotsTable, startDate, [...departedStudentIds])
    }

    return newSchoolYearId
  })
}

// ---------------------------------------------------------------------------------------------
// Sprint 7 — Templates & Βιβλιοθήκη (Technical Plan Στάδιο 6)
// ---------------------------------------------------------------------------------------------
// Ο πίνακας goalTemplates είναι η ΠΡΟΣΩΠΙΚΗ βιβλιοθήκη του εκπαιδευτικού — ξεχωριστός από το
// domainTemplates (system, read-only, seeded ανά τομέα, αμετάβλητο σε αυτό το στάδιο). Καμία
// ζωντανή σύνδεση προς goals: χρήση ενός template = αντιγραφή τιμών μέσω prefillFromSource
// (utils/goalTemplates.js), ΠΟΤΕ foreign key που θα μπορούσε να προκαλέσει cascade.

function assertValidTemplateContent({ domain, title }) {
  if (!domain || !DOMAIN_IDS.includes(domain)) {
    throw new Error(`Άγνωστος ή κενός τομέας: «${domain}»`)
  }
  if (!title || !title.trim()) {
    throw new Error('Ο τίτλος είναι υποχρεωτικός για ένα πρότυπο.')
  }
}

function pickTemplateFields(source) {
  const picked = {}
  for (const field of GOAL_TEMPLATE_FIELDS) {
    picked[field] = source[field] || ''
  }
  return picked
}

// Αποθηκεύει έναν υπάρχοντα στόχο ως επαναχρησιμοποιήσιμο πρότυπο. Ρητό whitelist (όχι spread)
// — ΠΟΤΕ studentId/status/statusChangedAt/baseline/goalEvents/timestamps (Technical Plan Στάδιο
// 6, σημείο 2) — μόνο ό,τι αναφέρεται ρητά στο GOAL_TEMPLATE_FIELDS περνάει στο νέο row.
export async function saveGoalAsTemplate(goalId) {
  const goal = await activeTable('goals').get(goalId)
  if (!goal) {
    throw new Error(`Δεν βρέθηκε στόχος με id=${goalId}`)
  }
  const fields = pickTemplateFields(goal)
  assertValidTemplateContent(fields)
  return activeTable('goalTemplates').add(withNewRowId(fields))
}

// Deterministic σειρά (κατά id, ΠΟΤΕ βασισμένη σε φυσική σειρά αποθήκευσης της IndexedDB — δεν
// είναι εγγυημένα σταθερή σε όλα τα storage backends) — σημείο 7.
export async function listGoalTemplates(domain) {
  const goalTemplatesTable = activeTable('goalTemplates')
  const all = domain
    ? await goalTemplatesTable.where('domain').equals(domain).toArray()
    : await goalTemplatesTable.toArray()
  return all.sort((a, b) => a.id - b.id)
}

// Ενημερώνει ΑΠΟΚΛΕΙΣΤΙΚΑ τα επιτρεπτά πεδία περιεχομένου ενός προσωπικού template — οποιοδήποτε
// άλλο κλειδί μέσα στο editableFields (π.χ. αν κάποιος περάσει κατά λάθος status/studentId)
// αγνοείται σιωπηλά, ΠΟΤΕ δεν εφαρμόζεται (ίδιο σκεπτικό ασφαλείας με το GoalWizardForm.jsx edit
// path — δομικά αδύνατο να διαρρεύσει lifecycle δεδομένο, όχι απλώς «συνήθως» ασφαλές). Η
// εγκυρότητα ελέγχεται πάνω στο ΤΕΛΙΚΟ συγχωνευμένο αποτέλεσμα (όχι μόνο στο delta), ώστε ένα
// update που θα άδειαζε το title να απορρίπτεται. Ένα μοναδικό atomic write — τίποτα να γίνει
// rollback αν αποτύχει η επικύρωση, αφού αυτή τρέχει ΠΡΙΝ από οποιαδήποτε εγγραφή στη βάση.
export async function updateGoalTemplate(id, editableFields) {
  const goalTemplatesTable = activeTable('goalTemplates')
  const existing = await goalTemplatesTable.get(id)
  if (!existing) {
    throw new Error(`Δεν βρέθηκε πρότυπο με id=${id}`)
  }
  const updates = {}
  for (const field of GOAL_TEMPLATE_FIELDS) {
    if (field in editableFields) updates[field] = editableFields[field]
  }
  assertValidTemplateContent({ ...pickTemplateFields(existing), ...updates })
  await goalTemplatesTable.update(id, updates)
}

// Καμία cascade — ο πίνακας goalTemplates δεν έχει ποτέ foreign key προς goals (χρήση = πάντα
// αντιγραφή τιμών, βλ. prefillFromSource). Goals που δημιουργήθηκαν παλιότερα από αυτό το
// πρότυπο (Στάδιο 7, sourceTemplateId) παραμένουν πλήρως ανέπαφα μετά τη διαγραφή του.
export async function deleteGoalTemplate(id) {
  const goalTemplatesTable = activeTable('goalTemplates')
  const existing = await goalTemplatesTable.get(id)
  if (!existing) {
    throw new Error(`Δεν βρέθηκε πρότυπο με id=${id}`)
  }
  await goalTemplatesTable.delete(id)
}

export default db
