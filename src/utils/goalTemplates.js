// Ρητό whitelist πεδίων περιεχομένου που επιτρέπεται να ζήσουν σε ένα πρότυπο (system domainTemplate
// ΔΕΝ αφορά αυτό το αρχείο — μόνο η προσωπική βιβλιοθήκη goalTemplates, Technical Plan Στάδιο 6)
// ή να περάσουν σε ένα copy-on-use prefill. ΠΟΤΕ object spread + αφαίρεση λίγων πεδίων (σημείο 2) —
// ένα μελλοντικό πεδίο στο goals (π.χ. sourceTemplateId, ή οτιδήποτε προστεθεί αργότερα) ΔΕΝ
// διαρρέει ποτέ κατά λάθος σε πρότυπο ή σε prefill, ακριβώς επειδή δεν αναφέρεται ρητά εδώ.
// Πηγή αλήθειας και για το db.js (saveGoalAsTemplate/updateGoalTemplate) και για το
// prefillFromSource παρακάτω — ένα σημείο ορισμού, όχι δύο ξεχωριστά hardcoded arrays.
export const GOAL_TEMPLATE_FIELDS = ['domain', 'title', 'description', 'criterion', 'measurementType']

// Μετατρέπει μια πηγή (goalTemplates row Ή ένα πλήρες goals row — copy-to-another-student, Στάδιο
// 7) σε αντικείμενο προσυμπλήρωσης για το Goal Wizard. Copy-on-use, ΠΟΤΕ ζωντανή αναφορά (Product
// Design §5, Technical Plan Στάδιο 6 σημείο 4):
//   - επιστρέφει ΠΑΝΤΑ νέο, literal αντικείμενο — καμία μεταβολή του source, καμία διαμοιρασμένη
//     αναφορά (όλες οι τιμές είναι strings, άρα εγγενώς immutable primitives, όχι nested objects).
//   - το baseline ΠΑΝΤΑ καθαρίζεται σε '' — είναι εγγενώς εξατομικευμένο ανά μαθητή (R8). Ακόμα κι
//     αν το source είναι πραγματικό goals row με γεμάτο baseline, εδώ πάντα αγνοείται.
//   - δύο ξεχωριστές κλήσεις με το ίδιο source επιστρέφουν δύο ανεξάρτητα αντικείμενα — η
//     μεταβολή του ενός ποτέ δεν επηρεάζει το άλλο ούτε το source.
export function prefillFromSource(source) {
  const result = {}
  for (const field of GOAL_TEMPLATE_FIELDS) {
    result[field] = source[field] || ''
  }
  result.baseline = ''
  return result
}
