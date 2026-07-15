import { resolveOccurrencesForDate } from './scheduleResolution.js'

// Read-only προβολή (Technical Plan §14) — ΙΔΙΑ συνάρτηση επίλυσης με την πραγματική παραγωγή
// (db.js → ensureDayGenerated, εκεί ζει σκόπιμα ώστε να μην υπάρχει κυκλική εξάρτηση utils↔db.js),
// καμία εγγραφή. Χρησιμοποιείται από το μηνιαίο ημερολόγιο για ενδείξεις δραστηριότητας σε ημέρες
// που δεν έχουν επισκεφτεί ακόμα, χωρίς να «γεμίζει» τη βάση με γραμμές για μέρες που απλά
// κοιτάει από μακριά.
export function projectOccurrencesForDate(date, { scheduleSlots, scheduleExceptions }) {
  return resolveOccurrencesForDate(date, { scheduleSlots, scheduleExceptions })
}
