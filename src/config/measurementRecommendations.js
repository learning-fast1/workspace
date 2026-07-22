// Προτεινόμενοι τύποι μέτρησης ανά τομέα — καθαρά οπτική υπόδειξη στην Οθόνη Α του Goal Wizard,
// ΠΟΤΕ προεπιλογή/φραγμός επιλογής (ρητή απόφαση χρήστη). ΣΗΜΕΙΩΣΗ: αυτό ανατρέπει συνειδητά μια
// προηγούμενη ρητή απόφαση αυτής της συνομιλίας («οι 8 τύποι παραμένουν ισότιμοι, καμία επαναφορά
// προτεινόμενων τύπων ανά domain») — καταγράφεται εδώ και στο Product Design artifact ως αλλαγή
// κατεύθυνσης, όχι παράβλεψη.
//
// Κλειδιά: domain id (ΟΧΙ το όνομα προς εμφάνιση — ίδια αρχή με το config/domains.js, ώστε
// μετονομασία τομέα να μην σπάει τις προτάσεις). Τιμές: measurementType values (ΟΧΙ Greek labels —
// ίδια αρχή με το utils/measurementTypes/index.js, το registry δουλεύει πάντα με σταθερά values).
//
// Απλοποίηση τομέων στόχων (8 βασικοί, από 14 αναλυτικούς) — 3 νέοι τομείς (mobility/cognitive/
// communication) συγχωνεύουν τις προτάσεις πολλών παλιών τομέων. Ένωση (concatenation) του
// υπάρχοντος περιεχομένου, ασφαλές deduplication, σταθερή σειρά (ίδιο idiom με domainTemplates.js).
function dedupeStable(arrays) {
  return [...new Set(arrays.flat())]
}

export const DOMAIN_MEASUREMENT_RECOMMENDATIONS = {
  // Συγχώνευση: fine-motor + gross-motor.
  mobility: dedupeStable([
    ['taskAnalysis', 'ratingScale', 'promptLevel'], // fine-motor
    ['ratingScale', 'duration', 'promptLevel'] // gross-motor
  ]),
  // Παρατήρηση παρέμεινε ρητά — ανοχή/αντιδράσεις σε ερεθίσματα.
  sensory: ['narrative', 'ratingScale', 'frequency'],
  // Συγχώνευση: attention + executive-functions + math.
  cognitive: dedupeStable([
    ['duration', 'frequency', 'promptLevel'], // attention
    ['taskAnalysis', 'promptLevel', 'ratingScale'], // executive-functions
    ['successRatio', 'checklist'] // math
  ]),
  'emotional-development': ['ratingScale', 'narrative', 'frequency'],
  'social-skills': ['ratingScale', 'frequency', 'promptLevel'],
  'self-care': ['taskAnalysis', 'promptLevel'],
  // Συγχώνευση: phonological-awareness + reading + writing + oral-language.
  communication: dedupeStable([
    ['successRatio', 'checklist'], // phonological-awareness
    ['successRatio', 'checklist', 'duration'], // reading
    ['ratingScale', 'successRatio', 'taskAnalysis'], // writing
    ['promptLevel', 'frequency', 'ratingScale'] // oral-language
  ]),
  // Μείωση ανεπιθύμητων: μετράμε πόσες φορές (Συχνότητα) και πόσο κρατάει (Διάρκεια).
  // Περιγραφική για καταγραφή ΠΣΣ (Πριν-Συμπεριφορά-Συνέπεια / ABC).
  behavior: ['frequency', 'duration', 'narrative']
}

export function isRecommendedMeasurementType(domainId, measurementType) {
  return DOMAIN_MEASUREMENT_RECOMMENDATIONS[domainId]?.includes(measurementType) ?? false
}
