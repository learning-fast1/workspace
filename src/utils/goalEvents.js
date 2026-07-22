import { Target, PauseCircle, Trophy, Archive, RefreshCw, CalendarRange, History, HelpCircle } from 'lucide-react'

// Μοναδική πηγή αλήθειας για το πώς μεταφράζεται ένα goalEvent σε ανθρώπινο κείμενο (Technical
// Plan Στάδιο 5, σημείο 2) — χρησιμοποιείται ΑΠΟΚΛΕΙΣΤΙΚΑ από το StudentTimeline.jsx και το
// GoalDetail.jsx. Κανένα από τα δύο components δεν κάνει δική του ερμηνεία τύπου event· κάνουν
// ΜΟΝΟ rendering του αποτελέσματος αυτής της συνάρτησης.
const STATUS_CHANGE_DESCRIPTIONS = {
  paused: { icon: PauseCircle, text: (title) => `Τέθηκε σε παύση: ${title}` },
  achieved: { icon: Trophy, text: (title) => `Ολοκληρώθηκε: ${title}` },
  archived: { icon: Archive, text: (title) => `Αρχειοθετήθηκε: ${title}` },
  active: { icon: RefreshCw, text: (title) => `Επανενεργοποιήθηκε: ${title}` }
}

function withNote(base, note) {
  return note ? `${base} — «${note}»` : base
}

// goal μπορεί να είναι undefined (π.χ. διαγράφηκε) — δεν πρέπει ΠΟΤΕ να πετάξει, μόνο να δείξει
// γενικό τίτλο.
export function describeGoalEvent(event, goal) {
  const title = goal?.title || 'στόχος'

  // trigger:'migration' (Στάδιο 1 backfill) ΠΑΝΤΑ ξεχωρίζει ρητά ως ιστορική εγγραφή — ΠΟΤΕ σαν
  // κανονική ενέργεια του εκπαιδευτικού (σημείο 4). Χρησιμοποιεί απευθείας το ήδη περιγραφικό
  // event.note (γράφτηκε ακριβώς γι' αυτό τον σκοπό στο db.js) — καμία δεύτερη αφήγηση εδώ.
  if (event.trigger === 'migration') {
    return {
      icon: History,
      text: `Ιστορικό: ${event.note || 'Αυτόματη καταγραφή από παλιότερη έκδοση'}`,
      isMigration: true
    }
  }

  if (event.type === 'created') {
    return { icon: Target, text: withNote(`Νέος στόχος: ${title}`, event.note), isMigration: false }
  }

  if (event.type === 'statusChanged' || event.type === 'revised') {
    const desc = STATUS_CHANGE_DESCRIPTIONS[event.toStatus]
    const base = desc ? desc.text(title) : `Άλλαξε κατάσταση: ${title}`
    return { icon: desc ? desc.icon : HelpCircle, text: withNote(base, event.note), isMigration: false }
  }

  if (event.type === 'schoolYearTransition') {
    return { icon: CalendarRange, text: withNote(`Μεταφέρθηκε στο νέο σχολικό έτος: ${title}`, event.note), isMigration: false }
  }

  // Άγνωστος τύπος event (π.χ. μελλοντική προσθήκη που αυτή η έκδοση δεν αναγνωρίζει ακόμα) —
  // ασφαλές γενικό fallback, ΠΟΤΕ throw, ΠΟΤΕ χάνεται η υπόλοιπη λίστα (σημείο 5).
  return { icon: HelpCircle, text: withNote(`Ενημέρωση στόχου: ${title}`, event.note), isMigration: false }
}

// Χρονολογική ταξινόμηση ΑΠΟΚΛΕΙΣΤΙΚΑ βάσει του πλήρους timestamp `at` (ISO datetime, με ώρα) —
// ΠΟΤΕ goal.status/statusChangedAt, ΠΟΤΕ heuristic (Technical Plan Στάδιο 5, σημείο 3). Το `at`
// περιλαμβάνει ώρα, άρα σωστή σειρά ακόμα και για events μέσα στην ΙΔΙΑ μέρα.
export function sortGoalEventsChronologically(events, direction = 'asc') {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at))
  return direction === 'desc' ? sorted.reverse() : sorted
}
