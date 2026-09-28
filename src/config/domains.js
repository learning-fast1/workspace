// Μοναδική πηγή αλήθειας για τους τομείς ΣΤΟΧΩΝ (goals.domain, goalTemplates.domain). Κάθε τομέας
// έχει ένα σταθερό id (τα δεδομένα αναφέρονται ΠΑΝΤΑ σε αυτό, ποτέ στο κείμενο εμφάνισης — η
// ονομασία μπορεί να αλλάξει ελεύθερα χωρίς να «σπάσουν» παλιές εγγραφές) και μια ελληνική ονομασία.
//
// Απλοποιημένη ταξινόμηση (8 βασικοί αναπτυξιακοί τομείς, από 14 αναλυτικούς πριν) — βλ.
// migrateGoalDomainsToBroaderDomains() στο db.js για το πλήρες legacy→νέο mapping. ΡΗΤΑ
// ΑΝΕΞΑΡΤΗΤΟ από το Λειτουργικό Προφίλ του μαθητή, το οποίο παραμένει σκόπιμα στους παλιούς,
// αναλυτικούς 14 τομείς — βλ. config/functionalProfileDomains.js (ξεχωριστό, παγωμένο αρχείο).
export const DOMAINS = [
  { id: 'mobility', name: 'Κινητική' },
  { id: 'sensory', name: 'Αισθητηριακή' },
  { id: 'cognitive', name: 'Γνωσιοαντιληπτική' },
  { id: 'emotional-development', name: 'Συναισθηματική' },
  { id: 'social-skills', name: 'Κοινωνική' },
  { id: 'self-care', name: 'Αυτομέριμνα' },
  // Αποσυρμένοι (αίτημα χρήστη, 2026-09): ΔΕΝ προσφέρονται πια για νέους στόχους/πρότυπα, αλλά
  // μένουν εδώ ώστε υπάρχοντες στόχοι με αυτό το domain να εμφανίζουν ακόμα σωστή ονομασία.
  { id: 'communication', name: 'Επικοινωνία', retired: true },
  { id: 'behavior', name: 'Συμπεριφορά', retired: true }
]

export const DOMAIN_IDS = DOMAINS.map((d) => d.id)

// Οι τομείς που προσφέρονται για επιλογή σε νέο στόχο/πρότυπο (χωρίς τους αποσυρμένους).
export const SELECTABLE_DOMAINS = DOMAINS.filter((d) => !d.retired)

// Για dropdown επεξεργασίας: οι επιλέξιμοι + ο τρέχων τομέας αν είναι αποσυρμένος, ώστε ένας
// υπάρχων στόχος να μη «χάνει» σιωπηλά την τιμή του στο select.
export function selectableDomainsIncluding(currentId) {
  const current = DOMAINS.find((d) => d.id === currentId)
  return current?.retired ? [...SELECTABLE_DOMAINS, current] : SELECTABLE_DOMAINS
}

export function domainName(id) {
  return DOMAINS.find((d) => d.id === id)?.name || id
}
