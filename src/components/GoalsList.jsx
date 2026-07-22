import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Target } from 'lucide-react'
import { db, listSchoolYears } from '../db.js'
import { priorityLabel, statusLabel, sortByPriority } from '../config/goalOptions.js'
import { domainName } from '../config/domains.js'
import { latestDatedMeasurement } from '../utils/measurementValue.js'
import { computeProgressPercent, formatRecordedValue } from '../utils/measurementTypes/index.js'
import { schoolYearToDateRange, wasGoalLiveDuringRange } from '../utils/schoolYearFilter.js'
import { sessionDateMap } from '../utils/sessions.js'
import { formatDateEl } from '../utils/date.js'
import SectionHeader from './ui/SectionHeader.jsx'
import EmptyState from './ui/EmptyState.jsx'
import ToggleRow from './ui/ToggleRow.jsx'
import Select from './ui/Select.jsx'
import Button from './ui/Button.jsx'
import GoalCard from './GoalCard.jsx'
import GoalStatusModal from './GoalStatusModal.jsx'
import SaveGoalAsTemplateModal from './SaveGoalAsTemplateModal.jsx'
import CopyGoalToStudentModal from './CopyGoalToStudentModal.jsx'
import './GoalsList.css'

// «Ζωντανοί» στόχοι — αυτό δείχνει η λίστα από προεπιλογή (Product Design §3): active ΚΑΙ paused,
// γιατί ένας παυμένος στόχος αναμένεται να συνεχίσει, δεν είναι «κλειστή υπόθεση» σαν το
// achieved/archived. Το toggle «Εμφάνιση όλων» προσθέτει τα δύο τελευταία ως ιστορικό.
const LIVE_STATUSES = ['active', 'paused']

const MS_PER_DAY = 24 * 60 * 60 * 1000
const STALE_AFTER_DAYS = 14

// Συγκεντρωτικό query — ΕΝΑ query ανά πίνακα (goals/measurements/sessions/goalEvents) για όλους
// τους στόχους μαζί, όχι ένα ανά κάρτα. Το GoalCard μένει καθαρά presentational (μηδενικές δικές
// του queries). Τα goalEvents χρειάζονται ΜΟΝΟ για το ιστορικό φίλτρο σχολικού έτους (Technical
// Plan Στάδιο 11, σημείο 6) — ένα query για όλους τους στόχους μαζί, ίδιο idiom με το Στάδιο 5/8.
async function loadGoalsWithProgress(studentId) {
  const goals = await db.goals.where('studentId').equals(studentId).toArray()
  const goalIds = goals.map((g) => g.id)
  const [measurements, sessions, goalEvents] = await Promise.all([
    db.measurements.where('studentId').equals(studentId).toArray(),
    db.sessions.toArray(),
    goalIds.length > 0 ? db.goalEvents.where('goalId').anyOf(goalIds).toArray() : Promise.resolve([])
  ])
  const sessionDateById = sessionDateMap(sessions)
  const today = new Date()

  return goals.map((g) => {
    const goalMeasurements = measurements
      .filter((m) => m.goalId === g.id)
      .map((m) => ({ ...m, date: sessionDateById[m.sessionId] }))

    // latestDatedMeasurement (utils/measurementValue.js) — εξήχθη σε Sprint 7 Στάδιο 8 ώστε το
    // utils/goalAttention.js (nearCriterion) να χρησιμοποιεί ΑΚΡΙΒΩΣ αυτή τη λογική αντί για
    // δεύτερο υπολογισμό. Μηδενική αλλαγή συμπεριφοράς εδώ.
    //
    // Technical Plan Στάδιο 9α — progressPercent/progressLabel περνούν πλέον ΑΠΟΚΛΕΙΣΤΙΚΑ από το
    // registry (utils/measurementTypes/index.js), με πλήρες context ({criterionConfig,
    // criterionText}) αντί για ένα προ-υπολογισμένο criterionTarget. Όταν ΔΕΝ είναι computable
    // (π.χ. διαβάθμιση όπως το Επίπεδο υποστήριξης/Κλίμακα 1–5, ή legacy κείμενο που δεν
    // parse-άρεται) αλλά ΥΠΑΡΧΕΙ μέτρηση, το progressLabel γίνεται ρητά «Τελευταία καταγραφή: ...»
    // (διόρθωση χρήστη) — ΠΟΤΕ κείμενο που θα μπορούσε να διαβαστεί ως ποσοστό ολοκλήρωσης στόχου,
    // αφού δεν ΕΙΝΑΙ πρόοδος προς το κριτήριο, είναι απλώς η πιο πρόσφατη καταγεγραμμένη τιμή.
    const latest = latestDatedMeasurement(goalMeasurements)
    const progress = computeProgressPercent(g.measurementType, latest?.value, {
      criterionConfig: g.criterionConfig,
      criterionText: g.criterion
    })
    const progressPercent = progress.computable ? progress.value : null
    const progressLabel = !progress.computable && latest?.value
      ? `Τελευταία καταγραφή: ${formatRecordedValue(g.measurementType, latest.value, g.criterionConfig)}`
      : null

    // Ίδιο κατώφλι/κανόνας «χωρίς μέτρηση» με το utils/goalAttention.js (Στάδιο 8) — reference date =
    // τελευταία μέτρηση, αλλιώς ημερομηνία έναρξης· χωρίς κανένα από τα δύο δεν σημαίνεται stale.
    const referenceDate = latest?.date || g.startDate
    let isStale = false
    if (g.status === 'active' && referenceDate) {
      isStale = Math.floor((today - new Date(referenceDate)) / MS_PER_DAY) > STALE_AFTER_DAYS
    }

    return {
      ...g,
      progressPercent,
      progressLabel,
      lastMeasuredLabel: latest?.date ? `Τελευταία μέτρηση: ${formatDateEl(latest.date)}` : null,
      isStale,
      goalEvents: goalEvents.filter((e) => e.goalId === g.id)
    }
  })
}

export default function GoalsList({ studentId }) {
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)
  // Το goal (με ήδη υπολογισμένο progressPercent) του οποίου το status-modal είναι ανοιχτό —
  // null όταν κλειστό. Ένα μόνο ανοιχτό modal τη φορά, ίδιο idiom με SessionModal/CalendarEventForm.
  const [statusModalGoal, setStatusModalGoal] = useState(null)
  const [templateModalGoal, setTemplateModalGoal] = useState(null)
  const [copyModalGoal, setCopyModalGoal] = useState(null)
  // '' = κανονική συμπεριφορά (showAll toggle, βασισμένη στη ΣΗΜΕΡΙΝΗ κατάσταση) — αλλιώς id ενός
  // σχολικού έτους, οπότε η λίστα δείχνει ΙΣΤΟΡΙΚΟ (Technical Plan Στάδιο 11, σημείο 6): στόχοι
  // που ήταν ζωντανοί ΟΠΟΤΕΔΗΠΟΤΕ μέσα σε εκείνο το έτος, ακόμα κι αν σήμερα είναι archived.
  const [selectedYearId, setSelectedYearId] = useState('')

  const goals = useLiveQuery(() => loadGoalsWithProgress(studentId), [studentId])
  const schoolYears = useLiveQuery(listSchoolYears, [])

  if (!goals) {
    return <p>Φόρτωση…</p>
  }

  const selectedYear = selectedYearId ? (schoolYears || []).find((y) => y.id === Number(selectedYearId)) : null

  let visible
  if (selectedYear) {
    // Ιστορικό φίλτρο — ΜΙΑ μετατροπή σε date range (schoolYearToDateRange, ίδια συνάρτηση με το
    // Session History/Ρυθμίσεις — σημείο 1), μετά wasGoalLiveDuringRange ανά στόχο. Το showAll
    // toggle δεν έχει νόημα εδώ (αγνοείται όσο είναι επιλεγμένο ιστορικό έτος).
    const { dateFrom, dateTo } = schoolYearToDateRange(selectedYear)
    visible = sortByPriority(goals.filter((g) => wasGoalLiveDuringRange(g, g.goalEvents, dateFrom, dateTo)))
  } else {
    visible = sortByPriority(goals.filter((g) => (showAll ? true : LIVE_STATUSES.includes(g.status))))
  }
  const noGoalsAtAll = goals.length === 0
  const noVisibleGoals = !noGoalsAtAll && visible.length === 0

  return (
    <div>
      <SectionHeader
        title="Στόχοι"
        action={{ label: 'Νέος στόχος', onClick: () => navigate(`/students/${studentId}/goals/new`) }}
      />

      {!noGoalsAtAll && schoolYears && schoolYears.length > 0 && (
        <div className="goals-list__year-filter">
          <label htmlFor="goalsYearFilter" className="goals-list__year-filter-label">Σχολικό έτος</label>
          <Select
            id="goalsYearFilter"
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
          >
            <option value="">Τρέχοντα</option>
            {[...schoolYears].reverse().map((y) => (
              <option key={y.id} value={y.id}>{y.label}{y.isActive ? ' (ενεργό)' : ''}</option>
            ))}
          </Select>
        </div>
      )}

      {selectedYear && (
        <div className="goals-list__year-banner" role="status">
          Προβολή ιστορικού: <strong>{selectedYear.label}</strong> — στόχοι που ήταν ενεργοί/σε παύση οποτεδήποτε μέσα σε αυτό το έτος, ακόμα κι αν σήμερα είναι αρχειοθετημένοι.
          <Button variant="ghost" onClick={() => setSelectedYearId('')}>Επιστροφή σε τρέχοντα</Button>
        </div>
      )}

      {!noGoalsAtAll && !selectedYear && (
        <ToggleRow checked={showAll} onChange={setShowAll} className="goals-list__toggle">
          Εμφάνιση όλων (και ολοκληρωμένων/αρχειοθετημένων)
        </ToggleRow>
      )}

      {/* Mobile review (product polish): ΧΩΡΙΣ δικό του CTA — το SectionHeader παραπάνω έχει ήδη
          «Νέος στόχος», δύο κουμπιά για την ΙΔΙΑ ενέργεια στην ίδια οθόνη ήταν μπερδεμένο. Κανόνας:
          όταν υπάρχει ήδη header action, κρατάμε ΜΟΝΟ αυτό — το empty state μένει icon+title+description. */}
      {noGoalsAtAll && (
        <EmptyState
          icon={Target}
          title="Δεν υπάρχουν στόχοι ακόμα"
          description="Πρόσθεσε τον πρώτο στόχο για αυτόν τον μαθητή."
        />
      )}

      {noVisibleGoals && !selectedYear && (
        <EmptyState
          icon={Target}
          title="Κανένας στόχος σε εξέλιξη"
          description="Υπάρχουν στόχοι ολοκληρωμένοι ή αρχειοθετημένοι — δοκίμασε «Εμφάνιση όλων»."
          actionLabel="Εμφάνιση όλων"
          onAction={() => setShowAll(true)}
        />
      )}

      {noVisibleGoals && selectedYear && (
        <EmptyState
          icon={Target}
          title="Κανένας στόχος σε αυτό το σχολικό έτος"
          description={`Κανένας στόχος αυτού του μαθητή δεν ήταν ενεργός/σε παύση μέσα στο «${selectedYear.label}».`}
          actionLabel="Επιστροφή σε τρέχοντα"
          onAction={() => setSelectedYearId('')}
        />
      )}

      {visible.length > 0 && (
        <div className="goals-list__grid">
          {visible.map((g) => (
            <GoalCard
              key={g.id}
              id={g.id}
              studentId={studentId}
              title={g.title}
              domainLabel={domainName(g.domain)}
              description={g.description}
              criterion={g.criterion}
              priority={g.priority}
              priorityLabel={priorityLabel(g.priority)}
              status={g.status}
              statusLabel={statusLabel(g.status)}
              progressPercent={g.progressPercent}
              progressLabel={g.progressLabel}
              lastMeasuredLabel={g.lastMeasuredLabel}
              isStale={g.isStale}
              onEdit={() => navigate(`/students/${studentId}/goals/${g.id}/edit`)}
              onOpenStatusModal={() => setStatusModalGoal(g)}
              onSaveAsTemplate={() => setTemplateModalGoal(g)}
              onCopyToStudent={() => setCopyModalGoal(g)}
            />
          ))}
        </div>
      )}

      {statusModalGoal && (
        <GoalStatusModal
          goal={statusModalGoal}
          onClose={() => setStatusModalGoal(null)}
          onSuccess={() => setStatusModalGoal(null)}
        />
      )}

      {templateModalGoal && (
        <SaveGoalAsTemplateModal
          goal={templateModalGoal}
          onClose={() => setTemplateModalGoal(null)}
        />
      )}

      {copyModalGoal && (
        <CopyGoalToStudentModal
          goal={copyModalGoal}
          currentStudentId={studentId}
          onClose={() => setCopyModalGoal(null)}
        />
      )}
    </div>
  )
}
