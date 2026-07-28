// Καθαρές συναρτήσεις υπολογισμού πάνω σε ήδη φορτωμένα δεδομένα (queue entries + σημερινές
// συνεδρίες) — καμία δική τους Dexie query, ίδιο μοτίβο με utils/measurementValue.js.
//
// Η «ολοκλήρωση» μιας γραμμής ΔΕΝ αποθηκεύεται ποτέ στο DailyQueueEntry — προκύπτει αποκλειστικά
// από το αν υπάρχει ήδη πραγματική Session σήμερα με ακριβώς το ίδιο σύνολο studentIds (ανεξάρτητα
// σειράς). Η ουρά είναι πρόθεση («τι έχω σήμερα»), η συνεδρία είναι γεγονός («τι έγινε») — δεν
// κρατάμε άμεση αναφορά (sessionId) μεταξύ τους, ώστε να μην μπορεί ποτέ να ξεσυγχρονιστεί: αν μια
// συνεδρία διαγραφεί/διορθωθεί αργότερα από το Session History, η ουρά βλέπει αμέσως τη σωστή,
// τρέχουσα εικόνα την επόμενη φορά που υπολογίζεται, χωρίς κανένα stale reference.

function sameStudentSet(a, b) {
  if (!a || !b || a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((id) => setA.has(id))
}

// Η (πρώτη) σημερινή συνεδρία που αντιστοιχεί ακριβώς σε αυτή τη γραμμή, αν υπάρχει.
export function matchedSession(entry, sessionsToday) {
  return sessionsToday.find((s) => sameStudentSet(s.studentIds, entry.studentIds)) || null
}

export function isEntryDone(entry, sessionsToday) {
  return matchedSession(entry, sessionsToday) !== null
}

// Σημερινές συνεδρίες που δεν αντιστοιχούν σε καμία προγραμματισμένη γραμμή — π.χ. έκτακτη
// συνεδρία εκτός «Η μέρα μου». Εμφανίζονται σαν έξτρα, ήδη ολοκληρωμένες γραμμές στο τέλος,
// χωρίς να γράφεται ποτέ νέα εγγραφή DailyQueueEntry γι' αυτές — καθαρά θέμα ανάγνωσης/παρουσίασης.
export function unplannedSessionsToday(entries, sessionsToday) {
  return sessionsToday.filter((s) => !entries.some((e) => sameStudentSet(e.studentIds, s.studentIds)))
}

// Αποτρέπει σιωπηλά διπλότυπα (Sprint 6, δεύτερος γύρος διορθώσεων — bug: «Έκτακτη ατομική/ομαδική»
// δημιουργούσε δεύτερη γραμμή για ήδη προγραμματισμένο μαθητή/ομάδα χωρίς καμία ένδειξη). Ελέγχει αν
// υπάρχει ΗΔΗ ακριβώς αυτό το σύνολο studentIds (ανεξάρτητα σειράς) στην ουρά ΚΑΙ στις έκτακτες
// συνεδρίες της ημέρας, και σε ποια κατάσταση — ώστε το UI να μπορεί να μπλοκάρει τη δημιουργία
// δεύτερης γραμμής και να εξηγήσει γιατί, αντί να αποτυγχάνει σιωπηλά.
export function findExistingEntryStatus(studentIds, entries, sessionsToday) {
  const matchingEntry = entries.find((e) => sameStudentSet(e.studentIds, studentIds))
  if (matchingEntry) {
    if (matchingEntry.status === 'skipped') return { status: 'skipped', entry: matchingEntry }
    const session = matchedSession(matchingEntry, sessionsToday)
    if (session) return { status: session.status === 'notHeld' ? 'notHeld' : 'completed', entry: matchingEntry, session }
    return { status: 'pending', entry: matchingEntry }
  }
  const unplannedSession = sessionsToday.find((s) => sameStudentSet(s.studentIds, studentIds))
  if (unplannedSession) {
    return { status: unplannedSession.status === 'notHeld' ? 'notHeld' : 'completed', session: unplannedSession }
  }
  return null
}

export function existingEntryStatusLabel(status) {
  switch (status) {
    case 'pending': return 'Ήδη στη μέρα μου'
    case 'skipped': return 'Παραλείφθηκε σήμερα'
    case 'notHeld': return 'Δεν πραγματοποιήθηκε'
    case 'completed': return 'Ολοκληρώθηκε ήδη σήμερα'
    default: return ''
  }
}

// Product Design (feedback χρήστη): «Η μέρα μου» έδειχνε ΚΑΙ πληροφορία (τι έχω σήμερα) ΚΑΙ
// ενέργειες (κουμπιά «Έκτακτη ατομική/ομαδική» μέσα στην ίδια κάρτα) — δύο ξεχωριστοί ρόλοι στο
// ίδιο στοιχείο. Οι ενέργειες μετακινήθηκαν ΕΚΤΟΣ του TodayQueue.jsx (Home.jsx/DayDetailPage.jsx
// τις αποδίδουν πλέον οι ίδιοι, ως global actions) — αυτό εδώ είναι η ΜΙΑ πηγή αλήθειας για τα δύο
// URLs (ίδια λογική date-query-param με πριν), ώστε οι δύο callers να μη γράψουν ο καθένας τη δική
// του, πιθανόν αποκλίνουσα εκδοχή.
export function addToQueueLinks(date, today) {
  const isToday = date === today
  return {
    individual: isToday ? '/today/add-individual' : `/today/add-individual?date=${date}`,
    group: isToday ? '/today/add-group' : `/today/add-group?date=${date}`
  }
}

export { sameStudentSet }
