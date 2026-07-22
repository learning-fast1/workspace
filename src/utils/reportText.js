import { formatRecordedValue, computeProgressPercent, meetsCriterion } from './measurementTypes/index.js'
import { sortByPriority, statusLabel } from '../config/goalOptions.js'
import { DOMAIN_IDS, domainName } from '../config/domains.js'
import { formatDateEl as formatDate } from './date.js'
import { sessionDateMap } from './sessions.js'

// Παράγει το προσχέδιο έκθεσης σε απλό κείμενο με ελαφριά επισήμανση επικεφαλίδων (# / ##) —
// αναγνώσιμο σε textarea, και εύκολα μετατρέψιμο σε .docx (βλ. utils/reportDocx.js).
export function generateReportText({ student, dateFrom, dateTo, goals, sessions, measurements, observations }) {
  const lines = []

  lines.push(`# Προσχέδιο έκθεσης προόδου`)
  lines.push(`Μαθητής: ${student.code}${student.nickname ? ' — ' + student.nickname : ''}`)
  lines.push(`Περίοδος: ${formatDate(dateFrom)} – ${formatDate(dateTo)}`)
  lines.push('')

  // sessions: όλες όσες περιλαμβάνουν τον μαθητή στο studentIds (παρόν ή απών) — ΕΚΤΟΣ από όσες
  // καταγράφηκαν απευθείας ως notHeld (Sprint 6: δεν πραγματοποιήθηκαν καθόλου, δεν είναι ούτε
  // «παρουσία» ούτε «απουσία μέσα σε πραγματική συνεδρία» — απλά δεν μετράνε σε καμία στήλη εδώ).
  // Οι μετρήσεις/χρόνος στήριξης μετράνε μόνο τις συνεδρίες όπου ήταν πράγματι παρών.
  const heldSessions = sessions.filter((s) => s.status !== 'notHeld')
  const attendedSessions = heldSessions.filter((s) => !s.absentStudentIds?.includes(student.id))
  const totalMinutes = attendedSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0)
  const absenceCount = heldSessions.length - attendedSessions.length

  lines.push('## Σύνοψη περιόδου')
  lines.push(`Συνεδρίες: ${attendedSessions.length}`)
  lines.push(`Συνολικός χρόνος στήριξης: ${totalMinutes} λεπτά`)
  if (absenceCount > 0) lines.push(`Απουσίες: ${absenceCount}`)
  lines.push('')

  const sessionDateById = sessionDateMap(sessions)
  const measurementsByGoal = {}
  for (const m of measurements) {
    if (!measurementsByGoal[m.goalId]) measurementsByGoal[m.goalId] = []
    measurementsByGoal[m.goalId].push({ ...m, date: sessionDateById[m.sessionId] })
  }
  for (const arr of Object.values(measurementsByGoal)) {
    arr.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }

  // Στόχοι με δραστηριότητα στην περίοδο: είτε μετρήθηκαν, είτε ξεκίνησαν μέσα σε αυτήν, είτε είναι ακόμα ενεργοί.
  const relevantGoals = goals.filter((g) => {
    const hasMeasurements = (measurementsByGoal[g.id] || []).length > 0
    const startedInPeriod = g.startDate >= dateFrom && g.startDate <= dateTo
    return hasMeasurements || startedInPeriod || g.status === 'active'
  })

  // Σταθερή σειρά τομέων (ίδια με domains.js) αντί για τυχαία σειρά εμφάνισης στα δεδομένα,
  // ώστε η έκθεση να μη μοιάζει αλλού-αλλού ταξινομημένη κάθε φορά που παράγεται.
  const domains = [...new Set(relevantGoals.map((g) => g.domain))]
    .sort((a, b) => DOMAIN_IDS.indexOf(a) - DOMAIN_IDS.indexOf(b))

  for (const domain of domains) {
    lines.push(`## ${domainName(domain)}`)
    const domainGoals = sortByPriority(relevantGoals.filter((g) => g.domain === domain))

    for (const g of domainGoals) {
      const goalMeasurements = measurementsByGoal[g.id] || []
      lines.push(`### ${g.title}`)
      lines.push(`Baseline: ${g.baseline || '—'}`)

      if (goalMeasurements.length === 0) {
        lines.push('Δεν καταγράφηκαν μετρήσεις στην περίοδο.')
      } else {
        const first = goalMeasurements[0]
        const last = goalMeasurements[goalMeasurements.length - 1]
        // context ίδιο σχήμα παντού στο registry (βλ. GoalsList.jsx/GoalDetail.jsx/SessionModal.jsx) —
        // criterionText = g.criterion, ΠΟΤΕ ολόκληρο το goal.
        const context = { criterionConfig: g.criterionConfig, criterionText: g.criterion }
        lines.push(`Τρέχον επίπεδο: ${formatRecordedValue(g.measurementType, last.value, g.criterionConfig)}`)

        if (goalMeasurements.length > 1) {
          const firstText = formatRecordedValue(g.measurementType, first.value, g.criterionConfig)
          const lastText = formatRecordedValue(g.measurementType, last.value, g.criterionConfig)
          const firstProgress = computeProgressPercent(g.measurementType, first.value, context)
          const lastProgress = computeProgressPercent(g.measurementType, last.value, context)
          // Αποκλειστικά βάσει registry (supportsProgress/computeProgressPercent) — ΚΑΜΙΑ hardcoded
          // λίστα τύπων εδώ. Όταν ο τύπος δεν υποστηρίζει αριθμητική πρόοδο (π.χ. Διάρκεια/Επίπεδο
          // υποστήριξης/Κλίμακα/Συχνότητα/Περιγραφική — Product Design §3, «κανένα έμφυτο 100%» ή
          // καθαρά ποιοτικό), ΚΑΜΙΑ επινοημένη σύγκριση Βελτίωση/Πτώση· απλή, τίμια χρονολογική
          // καταγραφή — ίδιο πνεύμα με το progressLabel fallback του GoalsList.jsx (Στάδιο 9α).
          if (firstProgress.computable && lastProgress.computable) {
            if (lastProgress.value > firstProgress.value) lines.push(`Πορεία: Βελτίωση από ${firstText} σε ${lastText}.`)
            else if (lastProgress.value < firstProgress.value) lines.push(`Πορεία: Πτώση από ${firstText} σε ${lastText}.`)
            else lines.push(`Πορεία: Σταθερό επίπεδο στο ${lastText}.`)
          } else {
            lines.push(`Πορεία: ${goalMeasurements.length} καταγραφές στην περίοδο — από «${firstText}» έως «${lastText}».`)
          }
        } else {
          lines.push('Πορεία: Μία μέτρηση καταγράφηκε στην περίοδο.')
        }

        if (g.criterion) {
          const achievement = meetsCriterion(g.measurementType, last.value, context)
          lines.push(achievement.computable
            ? `Κριτήριο: ${g.criterion} — ${achievement.value ? 'Επιτεύχθηκε' : 'Δεν έχει επιτευχθεί ακόμα'}.`
            : `Κριτήριο: ${g.criterion}`)
        }
      }

      lines.push(`Κατάσταση στόχου: ${statusLabel(g.status)}`)
      lines.push(`Μετρήσεις περιόδου: ${goalMeasurements.length}`)
      lines.push('')
    }
  }

  if (relevantGoals.length === 0) {
    lines.push('Δεν υπάρχουν στόχοι με δραστηριότητα σε αυτή την περίοδο.')
    lines.push('')
  }

  const periodObservations = observations
    .filter((o) => o.date >= dateFrom && o.date <= dateTo)
    .sort((a, b) => {
      if (a.milestone !== b.milestone) return a.milestone ? -1 : 1
      return a.date.localeCompare(b.date)
    })

  if (periodObservations.length > 0) {
    lines.push('## Παρατηρήσεις περιόδου (ποιοτικό υλικό προς ένταξη)')
    for (const o of periodObservations) {
      lines.push(`${o.milestone ? '⭐' : '-'} ${o.text} (${formatDate(o.date)})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
