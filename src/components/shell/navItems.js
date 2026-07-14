import { CalendarDays, Home, Settings, Users } from 'lucide-react'

// Μόνο υπαρκτές, λειτουργικές ενότητες — καμία αναφορά σε «Ομάδες»/«Πρότυπα» μέχρι να
// υπάρχουν πραγματικά routes/λειτουργίες γι' αυτές (βλ. SPEC.md). «Νέα συνεδρία» ΔΕΝ είναι εδώ
// σκόπιμα — είναι ενέργεια, όχι προορισμός (Sprint 4): παραμένει quick action στην Αρχική. Η
// «Πρόοδος» και οι «Εκθέσεις» επίσης ΔΕΝ είναι εδώ — ανήκουν στον μαθητή (StudentProfile tabs),
// όχι ανεξάρτητες περιοχές της εφαρμογής.
export const NAV_ITEMS = [
  { to: '/', label: 'Αρχική', icon: Home, end: true },
  { to: '/sessions', label: 'Συνεδρίες', icon: CalendarDays },
  { to: '/students', label: 'Μαθητές', icon: Users },
  { to: '/settings', label: 'Ρυθμίσεις', icon: Settings }
]
