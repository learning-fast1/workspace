// Χάρτης sessionId → date, για να βρίσκεται γρήγορα η ημερομηνία μιας συνεδρίας
// (π.χ. όταν έχουμε μια μέτρηση και θέλουμε να ξέρουμε πότε καταγράφηκε).
export function sessionDateMap(sessions) {
  return Object.fromEntries(sessions.map((s) => [s.id, s.date]))
}

// Sprint 8 (Home.jsx «Πρόσφατη δραστηριότητα»): αποκλείει notHeld ΚΑΙ τη σημερινή ημέρα (ήδη ορατή
// ως ολοκληρωμένες γραμμές στο «Η μέρα μου» — η επικάλυψη δεν πρόσθετε τίποτα, μόνο μήκος σελίδας),
// περιορίζει σε `limit` πιο πρόσφατες, μορφοποιεί για εμφάνιση. Καθαρή συνάρτηση (χωρίς Dexie/I/O)
// ώστε το φίλτρο ημερομηνίας να είναι unit-testable χωρίς live database.
export function selectRecentActivity(sessions, studentById, today, limit = 5) {
  return sessions
    .filter((s) => s.status !== 'notHeld' && s.date !== today)
    .slice(0, limit)
    .map((s) => ({
      id: s.id,
      date: s.date,
      durationMinutes: s.durationMinutes,
      studentLabel: s.studentIds.map((id) => studentById[id]?.code).filter(Boolean).join(', ') || '—'
    }))
}
