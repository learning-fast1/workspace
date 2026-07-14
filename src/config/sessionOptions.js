// Γρήγορες επιλογές διάρκειας συνεδρίας (λεπτά) — ένα tap στο τέλος του Teaching Mode.
export const DURATION_OPTIONS = [5, 10, 20, 40, 80]

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
