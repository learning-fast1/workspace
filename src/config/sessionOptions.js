// Γρήγορες επιλογές διάρκειας (λεπτά) — ΜΙΑ κοινή πηγή αλήθειας για το τέλος του Teaching Mode/
// SessionModal ΚΑΙ για το σταθερό πρόγραμμα (ScheduleSlotForm) — πριν ήταν δύο ξεχωριστές λίστες
// που δεν συμφωνούσαν (π.χ. πρόγραμμα σε 30′ αλλά καμία γρήγορη επιλογή 30′ στο τέλος της
// πραγματικής συνεδρίας). Οι 5′/80′ αφαιρέθηκαν — καμία τεκμηριωμένη επιχειρησιακή ανάγκη
// εντοπίστηκε γι' αυτές (Sprint 6, δεύτερος γύρος διορθώσεων)· παραμένουν διαθέσιμες μέσω του
// πεδίου «Άλλη διάρκεια» αν χρειαστούν ποτέ.
export const DURATION_OPTIONS = [10, 20, 30, 40, 45, 60]

// Κατάσταση συνεδρίας (Session.status, SPEC.md). Το Teaching Mode γράφει πάντα 'completed' —
// οι άλλες δύο τιμές γίνονται προσβάσιμες μόνο εκ των υστέρων, μέσα από το Session History
// (διόρθωση status μετά τη συνεδρία), όχι μέσα στο ίδιο το Teaching Mode.
export const SESSION_STATUSES = [
  { value: 'completed', label: 'Ολοκληρώθηκε' },
  { value: 'interrupted', label: 'Διακόπηκε' },
  { value: 'notHeld', label: 'Δεν πραγματοποιήθηκε' }
]

export const SESSION_STATUS_BADGE_VARIANT = {
  completed: 'success',
  interrupted: 'warning',
  notHeld: 'danger'
}

export function sessionStatusLabel(value) {
  return SESSION_STATUSES.find((s) => s.value === value)?.label || value
}
