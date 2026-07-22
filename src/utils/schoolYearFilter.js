// Μοναδική πηγή αλήθειας για τη μετατροπή ενός σχολικού έτους σε κοινό date range (Technical Plan
// Στάδιο 11, σημείο 1) — το Session History και τα Goals (GoalsList.jsx) καταναλώνουν ΑΠΟΚΛΕΙΣΤΙΚΑ
// αυτό, ΚΑΝΕΝΑ δεύτερο, ξεχωριστό «school-year filtering algorithm» ανά οθόνη.
export function schoolYearToDateRange(schoolYear) {
  return { dateFrom: schoolYear.startDate, dateTo: schoolYear.endDate }
}

// Ταξινόμηση σχολικών ετών κατά startDate (αύξουσα) — ΣΤΗ ΜΝΗΜΗ, ΠΟΤΕ db.schoolYears.orderBy(
// 'startDate') (bug που βρέθηκε σε πραγματικό browser smoke test, Sprint 7 κλείσιμο): το schema
// (db.js) δηλώνει schoolYears ΜΟΝΟ ως '++id, isActive' — το startDate δεν είναι, και δεν χρειάζεται
// να είναι, indexed πεδίο (ο πίνακας θα έχει πάντα λίγες δεκάδες γραμμές, ένα table scan +
// ταξινόμηση στη μνήμη είναι το ίδιο idiom με το ήδη υπάρχον scheduleSlots.active/schoolYears.
// isActive). Ένα .orderBy() πάνω σε μη-indexed keyPath πετάει Dexie SchemaError αμέσως, όχι απλά
// επιστρέφει άδειο/λάθος αποτέλεσμα — γι' αυτό ΚΑΘΕ κλήση σε αυτόν τον πίνακα πρέπει να περνάει
// ΑΠΟΚΛΕΙΣΤΙΚΑ από εδώ, ΠΟΤΕ απευθείας .orderBy(...) σε κανένα component.
export function sortSchoolYearsByStartDate(schoolYears) {
  return schoolYears.slice().sort((a, b) => a.startDate.localeCompare(b.startDate))
}

// Καταστάσεις που θεωρούνται «ζωντανός στόχος» — ίδιο σύνολο με το LIVE_STATUSES του GoalsList.jsx.
const LIVE_GOAL_STATUSES = new Set(['active', 'paused'])

function relevantEventsSorted(goalEvents) {
  return goalEvents
    .filter((e) => e.type === 'created' || e.type === 'statusChanged' || e.type === 'revised')
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at))
}

// Ήταν ο στόχος «ζωντανός» (active/paused) οποτεδήποτε μέσα στο [dateFrom, dateTo] — ΟΧΙ απλά αν
// είναι σήμερα active/paused (Technical Plan Στάδιο 11, σημείο 6): ένας στόχος archived ΣΗΜΕΡΑ
// μπορεί να είχε περάσει από active/paused μέσα στο επιλεγμένο ιστορικό έτος, και πρέπει να
// εμφανίζεται εκεί. Ανασυνθέτει το ιστορικό κατάστασης από goalEvents (ΠΟΤΕ από goal.status
// απευθείας, ίδια αρχή με το Στάδιο 5) — [event.at, επόμενο event.at) είναι το διάστημα ισχύος της
// κατάστασης toStatus του κάθε event· το τελευταίο διάστημα είναι ανοιχτό (ισχύει ακόμα).
//
// Όριο επικάλυψης: date-only σύγκριση (dateFrom/dateTo/goal.startDate είναι ήδη date strings,
// event.at είναι πλήρες ISO datetime — συγκρίνεται μόνο το πρώτο τμήμα). ΠΟΤΕ new Date() εσωτερικά.
export function wasGoalLiveDuringRange(goal, goalEvents, dateFrom, dateTo) {
  const events = relevantEventsSorted(goalEvents)

  // Δεν θα έπρεπε να συμβαίνει σε goal μετά το Στάδιο 1 backfill (κάθε στόχος έχει τουλάχιστον ένα
  // 'created' event) — αμυντικό fallback: η τρέχουσα κατάσταση θεωρείται ότι ίσχυε πάντα.
  if (events.length === 0) {
    return LIVE_GOAL_STATUSES.has(goal.status)
  }

  for (let i = 0; i < events.length; i++) {
    const status = events[i].toStatus
    if (!LIVE_GOAL_STATUSES.has(status)) continue
    const intervalStart = events[i].at.slice(0, 10)
    const intervalEnd = i + 1 < events.length ? events[i + 1].at.slice(0, 10) : null // null = ισχύει ακόμα
    const overlaps = intervalStart <= dateTo && (intervalEnd === null || dateFrom < intervalEnd)
    if (overlaps) return true
  }
  return false
}
