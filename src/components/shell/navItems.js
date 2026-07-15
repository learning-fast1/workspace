import { CalendarDays, CalendarRange, Home, Settings, Users } from 'lucide-react'

// Μόνο υπαρκτές, λειτουργικές ενότητες — καμία αναφορά σε «Ομάδες»/«Πρότυπα» μέχρι να
// υπάρχουν πραγματικά routes/λειτουργίες γι' αυτές (βλ. SPEC.md). «Νέα συνεδρία» ΔΕΝ είναι εδώ
// σκόπιμα — είναι ενέργεια, όχι προορισμός (Sprint 4): παραμένει quick action στην Αρχική. Η
// «Πρόοδος» και οι «Εκθέσεις» επίσης ΔΕΝ είναι εδώ — ανήκουν στον μαθητή (StudentProfile tabs),
// όχι ανεξάρτητες περιοχές της εφαρμογής.
//
// «Πρόγραμμα» (Sprint 6) — σκόπιμη εξαίρεση στον κανόνα «όχι feature-centric nav»: το σταθερό
// εβδομαδιαίο πρόγραμμα ανήκει στην ίδια την εκπαιδευτικό (πώς οργανώνει όλη τη δουλειά της),
// όχι σε συγκεκριμένο μαθητή — ίδιο σκεπτικό με τους «Μαθητές», όχι με την Πρόοδο/Εκθέσεις.
export const NAV_ITEMS = [
  { to: '/', label: 'Αρχική', icon: Home, end: true },
  { to: '/schedule', label: 'Πρόγραμμα', icon: CalendarRange },
  { to: '/sessions', label: 'Συνεδρίες', icon: CalendarDays },
  { to: '/students', label: 'Μαθητές', icon: Users },
  { to: '/settings', label: 'Ρυθμίσεις', icon: Settings }
]
