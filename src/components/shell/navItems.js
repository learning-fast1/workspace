import { Home, Settings, Users } from 'lucide-react'

// Μόνο υπαρκτές, λειτουργικές ενότητες — καμία αναφορά σε «Ομάδες»/«Πρότυπα» μέχρι να
// υπάρχουν πραγματικά routes/λειτουργίες γι' αυτές (βλ. SPEC.md).
export const NAV_ITEMS = [
  { to: '/', label: 'Αρχική', icon: Home, end: true },
  { to: '/students', label: 'Μαθητές', icon: Users },
  { to: '/settings', label: 'Ρυθμίσεις', icon: Settings }
]
