import { ClipboardList, Trophy, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { describeGoalEvent } from './goalEvents.js'
import { formatRecordedValue } from './measurementTypes/index.js'
import { clinicalRatingLabel } from '../config/clinicalAssessmentRatings.js'

const RATING_ICON = { worsened: TrendingDown, stable: Minus, improved: TrendingUp, mastered: Trophy }

// Ενοποιημένο, flat, αντίστροφα χρονολογικό feed για το «Ιστορικό» ενός στόχου (GoalDetail.jsx) —
// συγχωνεύει goalEvents + measurements + sessionGoalAssessments, ίδιο νοητικό μοντέλο με το
// StudentTimeline.jsx (student-level), αλλά ΧΩΡΙΣ group-by-month (ο όγκος ανά μεμονωμένο στόχο
// είναι πολύ μικρότερος — ρητή απόφαση, βλ. Product Proposal).
//
// Ειδική περίπτωση «Κατακτήθηκε»: μια sessionGoalAssessment με rating==='mastered' πυροδότησε ήδη
// (στο TeachingMode.jsx/handleSaveSession) μια πραγματική μετάβαση κατάστασης μέσω του
// transitionGoalStatus — που παράγει ΤΟ ΔΙΚΟ ΤΟΥ goalEvent (type:'statusChanged', toStatus:
// 'achieved', trigger:'teachingMode', sessionId: το ΙΔΙΟ sessionId). Χωρίς συγχώνευση θα
// εμφανίζονταν ΔΥΟ σχεδόν-ταυτόσημες γραμμές για την ΙΔΙΑ ενέργεια του δασκάλου — εδώ ταιριάζουν
// ΑΠΟΚΛΕΙΣΤΙΚΑ μέσω αυτού του κοινού sessionId (ΠΟΤΕ μέσω ημερομηνίας — μια backdated συνεδρία θα
// είχε διαφορετικό sessions.date από το πραγματικό goalEvent.at). Αν δεν βρεθεί ταίριασμα (π.χ.
// παλιά εγγραφή πριν προστεθεί το sessionId), υποχωρεί με ασφάλεια σε δύο ξεχωριστές γραμμές —
// ΠΟΤΕ throw, ΠΟΤΕ χαμένο entry.
export function buildGoalHistoryFeed(goal, { goalEvents = [], measurements = [], assessments = [], sessionDateById = {} } = {}) {
  const matchedMasteryEventIds = new Set()
  const matchedMasteryAssessmentIds = new Set()

  for (const assessment of assessments) {
    if (assessment.rating !== 'mastered') continue
    const matchingEvent = goalEvents.find(
      (e) => e.trigger === 'teachingMode' && e.type === 'statusChanged' && e.toStatus === 'achieved' && e.sessionId === assessment.sessionId
    )
    if (matchingEvent) {
      matchedMasteryEventIds.add(matchingEvent.id)
      matchedMasteryAssessmentIds.add(assessment.id)
    }
  }

  const entries = []

  for (const event of goalEvents) {
    if (matchedMasteryEventIds.has(event.id)) {
      // Συγχωνευμένη γραμμή — πιο συγκεκριμένη διατύπωση από το γενικό describeGoalEvent (που θα
      // έδειχνε το ίδιο ανεξάρτητα αν η ολοκλήρωση ήρθε από εδώ ή από το GoalStatusModal). Το
      // note είναι ΜΙΑ πηγή (event.note === το ίδιο κείμενο με το assessment.note, βλ. TeachingMode.jsx).
      entries.push({
        key: `goal-event-${event.id}`,
        at: event.at,
        date: event.at.slice(0, 10),
        icon: Trophy,
        text: event.note ? `Κατακτήθηκε — ο στόχος ολοκληρώθηκε επίσημα — «${event.note}»` : 'Κατακτήθηκε — ο στόχος ολοκληρώθηκε επίσημα',
        kind: 'assessment',
        sessionId: event.sessionId
      })
      continue
    }
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

  for (const assessment of assessments) {
    if (matchedMasteryAssessmentIds.has(assessment.id)) continue // ήδη συγχωνευμένη στο goalEvent παραπάνω
    const date = sessionDateById[assessment.sessionId]
    if (!date) continue
    const label = clinicalRatingLabel(assessment.rating)
    entries.push({
      key: `assessment-${assessment.id}`,
      at: undefined,
      date,
      icon: RATING_ICON[assessment.rating] || ClipboardList,
      text: assessment.note ? `${label} — «${assessment.note}»` : label,
      kind: 'assessment',
      sessionId: assessment.sessionId
    })
  }

  // Πιο πρόσφατα πρώτα· goalEvents έχουν πλήρες timestamp (at, με ώρα), measurements/assessments
  // μόνο ημερομηνία (μέσω sessionDateById) — ίδιο σκεπτικό ταξινόμησης με το StudentTimeline.jsx.
  return entries.sort((a, b) => (b.at || b.date).localeCompare(a.at || a.date))
}
