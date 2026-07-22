import { ClipboardList } from 'lucide-react'
import { describeGoalEvent } from './goalEvents.js'
import { formatRecordedValue } from './measurementTypes/index.js'

// Ενοποιημένο, flat, αντίστροφα χρονολογικό feed για το «Ιστορικό» ενός στόχου (GoalDetail.jsx) —
// συγχωνεύει goalEvents + measurements, ίδιο νοητικό μοντέλο με το StudentTimeline.jsx (student-level),
// αλλά ΧΩΡΙΣ group-by-month (ο όγκος ανά μεμονωμένο στόχο είναι πολύ μικρότερος — ρητή απόφαση, βλ.
// Product Proposal).
export function buildGoalHistoryFeed(goal, { goalEvents = [], measurements = [], sessionDateById = {} } = {}) {
  const entries = []

  for (const event of goalEvents) {
    const { icon, text } = describeGoalEvent(event, goal)
    entries.push({
      key: `goal-event-${event.id}`,
      at: event.at,
      date: event.at.slice(0, 10),
      icon,
      text,
      kind: 'lifecycle',
      sessionId: event.sessionId || null
    })
  }

  for (const measurement of measurements) {
    const date = sessionDateById[measurement.sessionId]
    if (!date) continue // ορφανή μέτρηση (π.χ. διαγράφηκε η συνεδρία) — δεν έχει νόημα χωρίς ημερομηνία
    entries.push({
      key: `measurement-${measurement.id}`,
      at: undefined,
      date,
      icon: ClipboardList,
      text: formatRecordedValue(goal.measurementType, measurement.value, goal.criterionConfig),
      kind: 'measurement',
      sessionId: measurement.sessionId
    })
  }

  // Πιο πρόσφατα πρώτα· goalEvents έχουν πλήρες timestamp (at, με ώρα), measurements μόνο ημερομηνία
  // (μέσω sessionDateById) — ίδιο σκεπτικό ταξινόμησης με το StudentTimeline.jsx.
  return entries.sort((a, b) => (b.at || b.date).localeCompare(a.at || a.date))
}
