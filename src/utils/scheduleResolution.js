import { weekdayOf } from './date.js'

// Καθαρή συνάρτηση επίλυσης — ΚΑΜΙΑ δική της Dexie query (ίδιο μοτίβο με utils/dailyQueue.js,
// utils/attentionSignal.js). Παίρνει ήδη φορτωμένα scheduleSlots/scheduleExceptions και επιστρέφει
// τις εφαρμοστέες εμφανίσεις (occurrences) μιας συγκεκριμένης ημερομηνίας.
//
// ΚΡΙΣΙΜΟ (Technical Plan §14): αυτή η συνάρτηση είναι η ΜΟΝΗ πηγή της λογικής «τι ισχύει σε
// ημερομηνία Δ» — τη χρησιμοποιούν ΚΑΙ η πραγματική παραγωγή (utils/scheduleGeneration.js, γράφει
// dailyQueue) ΚΑΙ η read-only προβολή του μηνιαίου ημερολογίου (καμία εγγραφή). Αν γραφόταν δύο
// φορές, θα ρισκάραμε ακριβώς αυτό που προσπαθεί να αποφύγει όλο το Sprint 6: δύο λογικές που
// μπορεί να διαφωνήσουν.
export function resolveOccurrencesForDate(date, { scheduleSlots, scheduleExceptions }) {
  const weekday = weekdayOf(date)

  const bySeries = new Map()
  for (const slot of scheduleSlots) {
    if (!bySeries.has(slot.seriesId)) bySeries.set(slot.seriesId, [])
    bySeries.get(slot.seriesId).push(slot)
  }

  const exceptionsForDate = scheduleExceptions.filter((e) => e.originalDate === date)
  const suppressedSeriesIds = new Set(
    exceptionsForDate.filter((e) => e.type === 'cancelled' || e.type === 'moved').map((e) => e.seriesId)
  )
  const movedIn = scheduleExceptions.filter((e) => e.type === 'moved' && e.newDate === date)

  const occurrences = []

  for (const [seriesId, versions] of bySeries) {
    if (suppressedSeriesIds.has(seriesId)) continue
    const active = versions.find(
      (v) => v.effectiveFrom <= date && (!v.effectiveUntil || v.effectiveUntil >= date)
    )
    if (!active || !active.active || active.dayOfWeek !== weekday) continue
    occurrences.push({
      seriesId,
      slotId: active.id,
      studentIds: active.studentIds,
      type: active.type,
      startTime: active.startTime,
      durationMinutes: active.durationMinutes,
      label: active.label || '',
      movedFrom: null
    })
  }

  for (const ex of movedIn) {
    occurrences.push({
      seriesId: ex.seriesId,
      slotId: null,
      studentIds: ex.studentIds,
      type: ex.slotType,
      startTime: ex.startTime,
      durationMinutes: ex.durationMinutes,
      label: ex.label || '',
      movedFrom: ex.originalDate
    })
  }

  occurrences.sort((a, b) => a.startTime.localeCompare(b.startTime))
  return occurrences
}
