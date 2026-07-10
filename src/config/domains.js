// Μοναδική πηγή αλήθειας για τους τομείς. Κάθε τομέας έχει ένα σταθερό id (χρησιμοποιείται
// στα δεδομένα — goals, functionalProfile, domainTemplates) και μια ελληνική ονομασία (μόνο
// για εμφάνιση). Η ονομασία μπορεί να αλλάξει ελεύθερα χωρίς να «σπάσουν» παλιές εγγραφές,
// γιατί αυτές αναφέρονται πάντα στο id, ποτέ στο κείμενο.
export const DOMAINS = [
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

export const DOMAIN_IDS = DOMAINS.map((d) => d.id)

export function domainName(id) {
  return DOMAINS.find((d) => d.id === id)?.name || id
}
