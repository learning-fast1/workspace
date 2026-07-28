import { addDays, formatDateEl } from './date.js'
import { matchedSession } from './dailyQueue.js'

// Phase 2 Stage A — εμπλουτισμός της Daily Queue με πληροφορίες που ο εκπαιδευτικός χρειάζεται
// να ξέρει ΠΡΙΝ ξεκινήσει τη σημερινή συνεδρία ενός μαθητή/ομάδας. Επίτηδες ΞΕΧΩΡΙΣΤΟ αρχείο από
// το goalAttention.js (goal-level, ΑΝΑΛΛΟΙΩΤΟ, απλά καλείται εδώ) και το attentionSignal.js
// (mood/absence/milestone/stale-goal ανά μαθητή, ΕΠΙΣΗΣ αναλλοίωτο — ο caller στο TodayQueue.jsx
// συνεχίζει να το καλεί ξεχωριστά, ΜΟΝΟ για ατομικές γραμμές, όπως και πριν). Τα δύο συστήματα
// παραμένουν ξεχωριστά στον ΥΠΟΛΟΓΙΣΜΟ — ενοποιούνται ΜΟΝΟ στην παρουσίαση, μέσω
// mergeQueueRowAttention παρακάτω.
//
// «εκκρεμής αξιολόγηση» (audit πριν την υλοποίηση) ΔΕΝ συμπεριλαμβάνεται εδώ σκόπιμα — το σημερινό
// schema (sessionGoalAssessments) καταγράφει κλινική αξιολόγηση ΜΟΝΟ ως αποτέλεσμα μιας ήδη
// πραγματοποιημένης συνεδρίας, χωρίς καμία έννοια περιοδικότητας/προθεσμίας. Θα απαιτούσε νέο
// schema/κανόνα, εκτός του πλαισίου αυτού του Sprint.
export const UNRESOLVED_ENTRY_LOOKBACK_DAYS = 14

// Σειρά προτεραιότητας (review χρήστη): unresolved session πρώτο (κάτι χάθηκε/εκκρεμεί), μετά τα
// πιο άμεσα attentionSignal (mood/absence), μετά goalAttention (stale/pausedTooLong, ίδια εσωτερική
// σειρά με το goalAttention.js), μετά draft report (υπενθύμιση, όχι επείγον), τέλος τα θετικά/
// ενημερωτικά σήματα (nearCriterion, milestone). Το attentionSignal.js's δικό του 'stale-goal' (§
// per-student, ξεχωριστός υπολογισμός από το goalAttention.js 'stale') μπαίνει στο ΙΔΙΟ tier με το
// 'stale' — ίδια βασική έννοια («χωρίς μέτρηση πολύ καιρό»), απλά διαφορετική υλοποίηση/πηγή.
const PRIORITY_RANK = {
  unresolvedSession: 0,
  mood: 1,
  absence: 1,
  'stale-goal': 2,
  stale: 2,
  pausedTooLong: 3,
  draftReport: 4,
  nearCriterion: 5,
  milestone: 6
}

function rankOf(type) {
  return PRIORITY_RANK[type] ?? 99
}

// Ομαδοποιεί items με ΜΟΝΑΔΙΚΟ πεδίο studentId (goals, reports) — ίδιο idiom με groupByGoalId
// του goalAttention.js.
export function groupByStudentIdField(items) {
  return items.reduce((map, item) => {
    if (!map[item.studentId]) map[item.studentId] = []
    map[item.studentId].push(item)
    return map
  }, {})
}

// dailyQueue entries έχουν studentIds (array — ατομικό Ή ομαδικό) — ΕΝΑ entry μπορεί να ανήκει σε
// πολλαπλά studentId buckets (μια ομαδική εμφάνιση αφορά όλα τα μέλη της).
export function groupEntriesByStudentId(entries) {
  const map = {}
  for (const entry of entries) {
    for (const studentId of entry.studentIds) {
      if (!map[studentId]) map[studentId] = []
      map[studentId].push(entry)
    }
  }
  return map
}

export function groupSessionsByDate(sessions) {
  return sessions.reduce((map, s) => {
    if (!map[s.date]) map[s.date] = []
    map[s.date].push(s)
    return map
  }, {})
}

// «Μη ολοκληρωμένη προηγούμενη συνεδρία»: παλαιότερη (date < today, εντός lookbackDays) dailyQueue
// εγγραφή ΑΥΤΟΥ του μαθητή που ΔΕΝ είναι skipped (ρητή απόφαση εκπαιδευτικού — ΔΕΝ μετράει ως
// «εκκρεμότητα») ΚΑΙ δεν έχει αντίστοιχη Session (ίδιο σύνολο studentIds, ίδια ημερομηνία — βλ.
// matchedSession). Πολλές τέτοιες εγγραφές → ΜΙΑ συνοπτική ένδειξη με πλήθος, όχι μία ανά εγγραφή
// (review χρήστη, σημείο 5).
export function unresolvedSessionReason(entriesForStudent, sessionsByDate, today, lookbackDays = UNRESOLVED_ENTRY_LOOKBACK_DAYS) {
  const cutoff = addDays(today, -lookbackDays)
  const unresolved = entriesForStudent.filter((e) =>
    e.date >= cutoff && e.date < today && e.status !== 'skipped' &&
    !matchedSession(e, sessionsByDate[e.date] || [])
  )
  if (unresolved.length === 0) return null
  const label = unresolved.length === 1
    ? `Εκκρεμεί συνεδρία από ${formatDateEl(unresolved[0].date)}`
    : `${unresolved.length} εκκρεμείς προηγούμενες συνεδρίες`
  // latestDate (Smart Notifications, review χρήστη): η πιο πρόσφατη εκκρεμής ημερομηνία — άγκυρα
  // για deterministic notification id (utils/notificationEngine.js). Αν εμφανιστεί ΝΕΟΤΕΡΗ
  // εκκρεμότητα, το id αλλάζει, ώστε ένα παλιό dismiss να μην κρύβει σιωπηλά τη νέα επιδείνωση.
  const latestDate = unresolved.reduce((max, e) => (e.date > max ? e.date : max), unresolved[0].date)
  return { type: 'unresolvedSession', count: unresolved.length, label, latestDate }
}

// «Πρόχειρη ή μη ολοκληρωμένη αναφορά»: reports.status === 'draft' (ήδη υπάρχον, αξιόπιστο πεδίο —
// βλ. ReportTab.jsx). Deduplicate ανά report id (review χρήστη, σημείο 6) — σχηματικά κάθε report
// ανήκει σε ΕΝΑ μόνο studentId, αλλά ο έλεγχος μένει ρητός/ασφαλής αντί να υποτεθεί σιωπηλά.
export function draftReportReason(reportsForStudent) {
  const draftIds = [...new Set(reportsForStudent.filter((r) => r.status === 'draft').map((r) => r.id))]
  if (draftIds.length === 0) return null
  const label = draftIds.length === 1 ? 'Πρόχειρη αναφορά' : `${draftIds.length} πρόχειρες αναφορές`
  return { type: 'draftReport', count: draftIds.length, label }
}

// Αποφεύγει διπλότυπες ενδείξεις για ΤΟΝ ΙΔΙΟ μαθητή ΚΑΙ τον ΙΔΙΟ τύπο λόγου (review χρήστη, σημείο
// 4) — π.χ. δύο ξεχωριστοί stale στόχοι του ίδιου μαθητή γίνονται ΜΙΑ ένδειξη (κρατάει τη «χειρότερη»
// βάσει days, όταν υπάρχει το πεδίο· αλλιώς κρατάει την πρώτη).
function dedupeReasons(reasons) {
  const byKey = new Map()
  for (const r of reasons) {
    const key = `${r.studentId}:${r.type}`
    const existing = byKey.get(key)
    if (!existing || (r.days ?? -1) > (existing.days ?? -1)) {
      byKey.set(key, r)
    }
  }
  return [...byKey.values()]
}

function sortAndDedupe(reasons) {
  return dedupeReasons(reasons).sort((a, b) => rankOf(a.type) - rankOf(b.type) || (a.studentId ?? 0) - (b.studentId ?? 0))
}

// Υπολογίζει ΟΛΕΣ τις νέες (Stage A) ενδείξεις μιας γραμμής της ουράς — ατομικής Ή ομαδικής, βλ.
// studentIds. goalAttentionByStudentId/pastEntriesByStudentId/reportsByStudentId/sessionsByDate:
// ΗΔΗ φορτωμένα/ομαδοποιημένα ΜΙΑ φορά από τον caller (TodayQueue.jsx) — καμία νέα Dexie query εδώ
// μέσα, καμία επανάληψη ομαδοποίησης ανά γραμμή (batched, χωρίς N+1 — review χρήστη).
export function computeQueueRowAttention(studentIds, { goalAttentionByStudentId, pastEntriesByStudentId, sessionsByDate, reportsByStudentId, today }) {
  const reasons = []
  for (const studentId of studentIds) {
    const unresolved = unresolvedSessionReason(pastEntriesByStudentId[studentId] || [], sessionsByDate, today)
    if (unresolved) reasons.push({ studentId, ...unresolved })

    const goalResults = goalAttentionByStudentId[studentId] || []
    for (const g of goalResults) {
      for (const r of g.reasons) {
        reasons.push({ studentId, goalId: g.goalId, ...r })
      }
    }

    const draft = draftReportReason(reportsByStudentId[studentId] || [])
    if (draft) reasons.push({ studentId, ...draft })
  }

  return sortAndDedupe(reasons)
}

// Ενοποίηση ΜΟΝΟ στην παρουσίαση (review χρήστη) — προσθέτει το ήδη υπολογισμένο attentionSignal.js
// αποτέλεσμα (mood/absence/milestone/stale-goal, ΜΟΝΟ ατομικές γραμμές, βλ. TodayQueue.jsx) στο
// ίδιο ταξινομημένο σύνολο, ΧΩΡΙΣ να αγγίζει τον δικό του υπολογισμό. `signal`: { studentId, type,
// label } ή null.
export function mergeQueueRowAttention(reasons, signal) {
  const merged = signal ? [...reasons, signal] : reasons
  return sortAndDedupe(merged)
}
