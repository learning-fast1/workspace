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
  { id: 'cognitive', name: 'Γνωστικές & Εκτελεστικές λειτουργίες' },
  { id: 'emotional-development', name: 'Συναισθηματική' },
  { id: 'social-skills', name: 'Κοινωνική' },
  { id: 'self-care', name: 'Αυτομέριμνα' },
  { id: 'communication', name: 'Επικοινωνία' },
  { id: 'behavior', name: 'Συμπεριφορά' }
]

export const DOMAIN_IDS = DOMAINS.map((d) => d.id)

export function domainName(id) {
  return DOMAINS.find((d) => d.id === id)?.name || id
}
