// Seed data για τα DomainTemplate — προτάσεις ανά τομέα που προ-συμπληρώνουν τη φόρμα-οδηγό στόχων.
// Αντιγράφεται στη βάση (πίνακας domainTemplates) την πρώτη φορά· από εκεί κι έπειτα είναι επεξεργάσιμο από τον χρήστη.
// Κλειδιά = τα id του src/config/domains.js (όχι η ελληνική ονομασία — αυτή ζει μόνο εκεί).
export const DOMAIN_TEMPLATES_SEED = {
  'fine-motor': {
    suggestedMeasurementTypes: ['taskAnalysis', 'promptLevel'],
    commonCriteria: ['4 από 5 προσπάθειες σε 3 συνεχόμενες συνεδρίες', 'Ανεξάρτητα σε 8 από 10 δοκιμές'],
    baselineExamples: ['Χρειάζεται σωματική βοήθεια για τη λαβή του μολυβιού.', 'Κρατά το ψαλίδι αλλά δεν κόβει σε ευθεία γραμμή.'],
    goalStarters: ['Ο μαθητής θα κρατά το μολύβι με τριποδική λαβή ανεξάρτητα.', 'Ο μαθητής θα χρησιμοποιεί το ψαλίδι για να κόψει σε ευθεία γραμμή.']
  },
  'gross-motor': {
    suggestedMeasurementTypes: ['duration', 'taskAnalysis'],
    commonCriteria: ['Σε 4 από 5 προσπάθειες', 'Για 5 συνεχόμενα λεπτά'],
    baselineExamples: ['Βαδίζει με στήριξη.', 'Διατηρεί την ισορροπία για 3 δευτερόλεπτα.'],
    goalStarters: ['Ο μαθητής θα διατηρεί την ισορροπία σε ένα πόδι για 5 δευτερόλεπτα.', 'Ο μαθητής θα ανεβαίνει σκάλες εναλλάξ χωρίς στήριξη.']
  },
  attention: {
    suggestedMeasurementTypes: ['duration', 'successRatio'],
    commonCriteria: ['Σε 4 από 5 δραστηριότητες', 'Για 10 συνεχόμενα λεπτά'],
    baselineExamples: ['Παραμένει σε δραστηριότητα για 2 λεπτά.', 'Διασπάται από ερεθίσματα μέσα σε 1 λεπτό.'],
    goalStarters: ['Ο μαθητής θα παραμένει συγκεντρωμένος σε δραστηριότητα για 10 λεπτά.', 'Ο μαθητής θα ολοκληρώνει μια εργασία χωρίς διάσπαση.']
  },
  'executive-functions': {
    suggestedMeasurementTypes: ['taskAnalysis', 'promptLevel'],
    commonCriteria: ['Ανεξάρτητα σε 4 από 5 προσπάθειες', 'Με μία λεκτική υπόδειξη'],
    baselineExamples: ['Χρειάζεται βήμα-βήμα καθοδήγηση για να οργανώσει το υλικό του.'],
    goalStarters: ['Ο μαθητής θα οργανώνει το υλικό του πριν την έναρξη της δραστηριότητας.', 'Ο μαθητής θα ακολουθεί οδηγίες 2 βημάτων ανεξάρτητα.']
  },
  sensory: {
    suggestedMeasurementTypes: ['successRatio', 'duration'],
    commonCriteria: ['Σε 4 από 5 παρατηρήσεις', 'Μείωση της συχνότητας κατά 50%'],
    baselineExamples: ['Αντιδρά έντονα σε δυνατούς ήχους καθημερινά.'],
    goalStarters: ['Ο μαθητής θα παραμένει ήρεμος παρουσία δυνατών ήχων.', 'Ο μαθητής θα χρησιμοποιεί ακουστικά όταν χρειάζεται.']
  },
  'phonological-awareness': {
    suggestedMeasurementTypes: ['successRatio'],
    commonCriteria: ['4 από 5 προσπάθειες σε 3 συνεχόμενες συνεδρίες', '8 από 10 λέξεις'],
    baselineExamples: ['Εντοπίζει σωστά το αρχικό φώνημα σε 1 από 5 λέξεις.'],
    goalStarters: ['Ο μαθητής θα εντοπίζει το αρχικό φώνημα σε μονοσύλλαβες λέξεις.', 'Ο μαθητής θα συνθέτει φωνήματα για να σχηματίσει λέξη.']
  },
  reading: {
    suggestedMeasurementTypes: ['successRatio', 'duration'],
    commonCriteria: ['4 από 5 λέξεις σωστά', 'Ρέουσα ανάγνωση 30 λέξεων/λεπτό'],
    baselineExamples: ['Διαβάζει συλλαβιστά μονοσύλλαβες λέξεις.'],
    goalStarters: ['Ο μαθητής θα διαβάζει προτάσεις με ρέουσα ανάγνωση.', 'Ο μαθητής θα κατανοεί σύντομο κείμενο απαντώντας σε ερωτήσεις.']
  },
  writing: {
    suggestedMeasurementTypes: ['taskAnalysis', 'successRatio'],
    commonCriteria: ['4 από 5 προσπάθειες', 'Χωρίς λάθη σε 3 συνεχόμενες συνεδρίες'],
    baselineExamples: ['Αντιγράφει απλά σχήματα με βοήθεια.'],
    goalStarters: ['Ο μαθητής θα γράφει λέξεις με σωστή αντιγραφή.', 'Ο μαθητής θα γράφει μια σύντομη πρόταση ανεξάρτητα.']
  },
  math: {
    suggestedMeasurementTypes: ['successRatio'],
    commonCriteria: ['4 από 5 προσπάθειες', '8 από 10 ασκήσεις'],
    baselineExamples: ['Αριθμεί μέχρι το 5 με βοήθεια.'],
    goalStarters: ['Ο μαθητής θα αριθμεί αντικείμενα μέχρι το 10.', 'Ο μαθητής θα λύνει προβλήματα πρόσθεσης μιας πράξης.']
  },
  'oral-language': {
    suggestedMeasurementTypes: ['successRatio', 'promptLevel'],
    commonCriteria: ['4 από 5 ευκαιρίες', 'Ανεξάρτητα σε 3 συνεχόμενες συνεδρίες'],
    baselineExamples: ['Χρησιμοποιεί μονολεκτικές εκφράσεις για να ζητήσει βοήθεια.'],
    goalStarters: ['Ο μαθητής θα σχηματίζει προτάσεις 3-4 λέξεων.', 'Ο μαθητής θα απαντά σε ερωτήσεις κατανόησης.']
  },
  'social-skills': {
    suggestedMeasurementTypes: ['successRatio', 'duration'],
    commonCriteria: ['4 από 5 ευκαιρίες', 'Σε 3 συνεχόμενες συνεδρίες'],
    baselineExamples: ['Παίζει παράλληλα χωρίς αλληλεπίδραση με συνομηλίκους.'],
    goalStarters: ['Ο μαθητής θα συμμετέχει σε συνεργατικό παιχνίδι με έναν συνομήλικο.', 'Ο μαθητής θα περιμένει τη σειρά του σε ομαδική δραστηριότητα.']
  },
  'emotional-development': {
    suggestedMeasurementTypes: ['successRatio', 'promptLevel'],
    commonCriteria: ['4 από 5 ευκαιρίες', 'Με μία λεκτική υπόδειξη'],
    baselineExamples: ['Δυσκολεύεται να διαχειριστεί την απογοήτευση χωρίς έκρηξη.'],
    goalStarters: ['Ο μαθητής θα εκφράζει λεκτικά το συναίσθημά του αντί να αντιδρά σωματικά.', 'Ο μαθητής θα ζητά βοήθεια όταν αναστατωθεί.']
  },
  'self-care': {
    suggestedMeasurementTypes: ['taskAnalysis', 'promptLevel'],
    commonCriteria: ['Ανεξάρτητα σε 4 από 5 προσπάθειες', 'Με ελάχιστη σωματική βοήθεια'],
    baselineExamples: ['Χρειάζεται πλήρη σωματική βοήθεια για να ντυθεί.'],
    goalStarters: ['Ο μαθητής θα ντύνεται ανεξάρτητα.', 'Ο μαθητής θα πλένει τα χέρια του ακολουθώντας τα βήματα ανεξάρτητα.']
  },
  behavior: {
    suggestedMeasurementTypes: ['duration', 'successRatio'],
    commonCriteria: ['Μείωση συχνότητας κατά 50%', 'Σε 4 από 5 ευκαιρίες'],
    baselineExamples: ['Εκδηλώνει εκρήξεις θυμού 3-4 φορές την ημέρα.'],
    goalStarters: ['Ο μαθητής θα χρησιμοποιεί λεκτικές στρατηγικές αντί για εκρήξεις θυμού.', 'Ο μαθητής θα παραμένει στη δραστηριότητα χωρίς φυγή.']
  }
}
