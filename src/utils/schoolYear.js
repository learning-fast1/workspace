// Πρόταση σχολικού έτους από τη σημερινή ημερομηνία (Technical Plan Στάδιο 10, σημείο 10) — pure,
// δέχεται `today` ως παράμετρο (ΠΟΤΕ new Date() εσωτερικά, ίδια αρχή με utils/goalAttention.js) ώστε
// να είναι deterministic και ελέγξιμο. Ελληνική σύμβαση σχολικού έτους: Σεπτέμβριος–Δεκέμβριος →
// ανήκει στο έτος που μόλις ξεκίνησε (π.χ. Οκτ 2026 → «2026-2027»)· Ιανουάριος–Αύγουστος → ανήκει
// στο έτος που ξεκίνησε τον προηγούμενο Σεπτέμβριο (π.χ. Ιούλ 2026 → «2025-2026»).
export function suggestSchoolYearDates(today) {
  const year = today.getFullYear()
  const month = today.getMonth() + 1 // 1-12
  const startYear = month >= 9 ? year : year - 1
  return { startDate: `${startYear}-09-01`, endDate: `${startYear + 1}-06-30` }
}

// Το label ΔΕΝ είναι η πηγή αλήθειας για τις ημερομηνίες (σημείο 10) — απλά μια ανθρώπινη ετικέτα
// στο ίδιο format «YYYY-YYYY», παραγόμενη ανεξάρτητα από το ίδιο startYear ώστε να συμφωνεί πάντα
// με το suggestSchoolYearDates, αλλά τα δύο πεδία (startDate/endDate) παραμένουν πραγματικά,
// επεξεργάσιμα ξεχωριστά — αλλαγή του label ΔΕΝ αλλάζει τις ημερομηνίες και το αντίστροφο.
export function suggestSchoolYearLabel(today) {
  const { startDate } = suggestSchoolYearDates(today)
  const startYear = Number(startDate.slice(0, 4))
  return `${startYear}-${startYear + 1}`
}
