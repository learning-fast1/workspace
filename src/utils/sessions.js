// Χάρτης sessionId → date, για να βρίσκεται γρήγορα η ημερομηνία μιας συνεδρίας
// (π.χ. όταν έχουμε μια μέτρηση και θέλουμε να ξέρουμε πότε καταγράφηκε).
export function sessionDateMap(sessions) {
  return Object.fromEntries(sessions.map((s) => [s.id, s.date]))
}
