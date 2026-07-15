const SOON_THRESHOLD_MINUTES = 60

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Χρονικά ευαίσθητη ένδειξη μιας γραμμής (Product Design, αναθεωρημένος γύρος §Ε) — «Τώρα» /
// «Σε Χ λεπτά» / «Πέρασε» / καμία ένδειξη (απλή ώρα) όταν είναι αρκετά μακρινή ώστε ένα countdown
// να μην βοηθά (κανόνας των δύο ερωτήσεων: ένα «σε 4 ώρες» δεν βοηθά να ξεκινήσει/τελειώσει τίποτα
// πιο γρήγορα). Καθαρή συνάρτηση — δέχεται `now` ως Date για να είναι test-friendly.
export function timeAwareness(plannedTime, durationMinutes, now = new Date()) {
  if (!plannedTime) return { state: null, label: null }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = toMinutes(plannedTime)
  const endMinutes = startMinutes + (durationMinutes || 0)

  if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) {
    return { state: 'now', label: 'Τώρα' }
  }
  if (nowMinutes < startMinutes) {
    const diff = startMinutes - nowMinutes
    if (diff <= SOON_THRESHOLD_MINUTES) {
      return { state: 'soon', label: diff === 1 ? 'Σε 1 λεπτό' : `Σε ${diff} λεπτά` }
    }
    return { state: null, label: null }
  }
  return { state: 'overdue', label: 'Πέρασε' }
}
