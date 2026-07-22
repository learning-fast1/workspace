// Παγωμένο αντίγραφο των 14 αναλυτικών τομέων — ΑΠΟΚΛΕΙΣΤΙΚΑ για το Λειτουργικό Προφίλ μαθητή
// (FunctionalProfileEditor.jsx/profileOptions.js). Ρητά ΑΝΕΞΑΡΤΗΤΟ από το config/domains.js (οι 8
// τομείς στόχων) — απόφαση χρήστη: το Λειτουργικό Προφίλ παραμένει προσωρινά στην αναλυτική
// ταξινόμηση, χωρίς να επηρεάζεται από την απλοποίηση των τομέων στόχων. Τα ids εδώ είναι ΑΚΡΙΒΩΣ
// τα ίδια με τα ΠΑΛΙΑ ids του config/domains.js πριν την απλοποίηση — profileOptions.js τα
// χρησιμοποιεί ήδη ως κλειδιά, ΚΑΜΙΑ αλλαγή εκεί.
export const FUNCTIONAL_PROFILE_DOMAINS = [
  { id: 'fine-motor', name: 'Λεπτή κινητικότητα' },
  { id: 'gross-motor', name: 'Αδρή κινητικότητα' },
  { id: 'attention', name: 'Προσοχή/Συγκέντρωση' },
  { id: 'executive-functions', name: 'Εκτελεστικές λειτουργίες' },
  { id: 'sensory', name: 'Αισθητηριακός τομέας' },
  { id: 'phonological-awareness', name: 'Φωνολογική ενημερότητα' },
  { id: 'reading', name: 'Ανάγνωση' },
  { id: 'writing', name: 'Γραπτός λόγος' },
  { id: 'math', name: 'Μαθηματικά' },
  { id: 'oral-language', name: 'Προφορικός λόγος' },
  { id: 'social-skills', name: 'Κοινωνικές δεξιότητες' },
  { id: 'emotional-development', name: 'Συναισθηματική ανάπτυξη' },
  { id: 'self-care', name: 'Αυτοεξυπηρέτηση' },
  { id: 'behavior', name: 'Συμπεριφορά' }
]

export const FUNCTIONAL_PROFILE_DOMAIN_IDS = FUNCTIONAL_PROFILE_DOMAINS.map((d) => d.id)

export function functionalProfileDomainName(id) {
  return FUNCTIONAL_PROFILE_DOMAINS.find((d) => d.id === id)?.name || id
}
