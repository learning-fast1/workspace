// Μέρες εβδομάδας — index = JS Date.getDay() (0=Κυριακή...6=Σάββατο), ίδια σύμβαση με το
// utils/date.js weekdayOf(). Δευτέρα-Παρασκευή είναι οι προεπιλεγμένα ορατές (βλ. SchedulePage) —
// Σάββατο/Κυριακή διαθέσιμα αλλά κρυμμένα από προεπιλογή (Product Design: δεν καταλαμβάνουν χώρο
// για κάτι που η πλειοψηφία δεν θα χρησιμοποιήσει ποτέ).
export const WEEKDAYS = [
  { value: 0, label: 'Κυριακή', short: 'Κυ' },
  { value: 1, label: 'Δευτέρα', short: 'Δε' },
  { value: 2, label: 'Τρίτη', short: 'Τρ' },
  { value: 3, label: 'Τετάρτη', short: 'Τε' },
  { value: 4, label: 'Πέμπτη', short: 'Πε' },
  { value: 5, label: 'Παρασκευή', short: 'Πα' },
  { value: 6, label: 'Σάββατο', short: 'Σα' }
]

export const WEEKDAYS_MON_FRI = WEEKDAYS.filter((d) => d.value >= 1 && d.value <= 5)

export function weekdayLabel(value) {
  return WEEKDAYS.find((d) => d.value === value)?.label || ''
}

// Κατηγορίες γεγονότων ημερολογίου (Sprint 6) — προαιρετικές (Product Design: ελεύθερος τίτλος +
// προαιρετική κατηγορία, ώστε να χρησιμοποιούνται και για προσωπικές υπενθυμίσεις). Οι δύο πρώτες
// (holiday/schoolEvent) είναι οι μόνες που πυροδοτούν την πρόταση μαζικής ακύρωσης (βλ.
// CalendarEventForm) — καθαρά επειδή αυτές τυπικά σημαίνουν «δεν διδάσκω σήμερα».
export const CALENDAR_EVENT_CATEGORIES = [
  { value: 'holiday', label: 'Αργία', variant: 'danger' },
  { value: 'schoolEvent', label: 'Σχολική εκδήλωση', variant: 'warning' },
  { value: 'meeting', label: 'Συνάντηση', variant: 'primary' },
  { value: 'evaluation', label: 'Αξιολόγηση', variant: 'primary' },
  { value: 'reminder', label: 'Προσωπική υπενθύμιση', variant: 'neutral' },
  { value: 'other', label: 'Άλλο', variant: 'neutral' }
]

export const BULK_CANCEL_CATEGORIES = ['holiday', 'schoolEvent']

export function eventCategoryOption(value) {
  return CALENDAR_EVENT_CATEGORIES.find((c) => c.value === value) || null
}

export function eventCategoryLabel(value) {
  return eventCategoryOption(value)?.label || ''
}
