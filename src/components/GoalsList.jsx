import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Target } from 'lucide-react'
import { db } from '../db.js'
import { priorityLabel, statusLabel, sortByPriority } from '../config/goalOptions.js'
import { domainName } from '../config/domains.js'
import { measurementNumericValue, parseCriterionTarget } from '../utils/measurementValue.js'
import { sessionDateMap } from '../utils/sessions.js'
import { formatDateEl } from '../utils/date.js'
import SectionHeader from './ui/SectionHeader.jsx'
import EmptyState from './ui/EmptyState.jsx'
import ToggleRow from './ui/ToggleRow.jsx'
import GoalCard from './GoalCard.jsx'
import './GoalsList.css'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const STALE_AFTER_DAYS = 14

// Συγκεντρωτικό query — ΕΝΑ query ανά πίνακα (goals/measurements/sessions) για όλους τους στόχους
// μαζί, όχι ένα ανά κάρτα. Το GoalCard μένει καθαρά presentational (μηδενικές δικές του queries).
async function loadGoalsWithProgress(studentId) {
  const [goals, measurements, sessions] = await Promise.all([
    db.goals.where('studentId').equals(studentId).toArray(),
    db.measurements.where('studentId').equals(studentId).toArray(),
    db.sessions.toArray()
  ])
  const sessionDateById = sessionDateMap(sessions)
  const today = new Date()

  return goals.map((g) => {
    const goalMeasurements = measurements
      .filter((m) => m.goalId === g.id)
      .map((m) => ({ ...m, date: sessionDateById[m.sessionId] }))
      .filter((m) => m.date)
      .sort((a, b) => a.date.localeCompare(b.date))

    const latest = goalMeasurements[goalMeasurements.length - 1] || null
    const numericValue = latest ? measurementNumericValue(g.measurementType, latest.value) : null
    const criterionTarget = parseCriterionTarget(g.criterion, g.measurementType)

    // Κανονικοποίηση σε 0-100 μόνο όπου έχει σαφές νόημα (βλ. UX proposal) — αλλιώς raw τιμή σαν κείμενο.
    let progressPercent = null
    let progressLabel = null
    if (numericValue !== null) {
      if (g.measurementType === 'successRatio') {
        progressPercent = numericValue
      } else if (g.measurementType === 'taskAnalysis') {
        progressPercent = criterionTarget ? Math.min(100, Math.round((numericValue / criterionTarget) * 100)) : null
        if (progressPercent === null) progressLabel = `${numericValue} βήματα`
      } else if (g.measurementType === 'promptLevel') {
        progressPercent = Math.round(((numericValue - 1) / 2) * 100)
      } else if (g.measurementType === 'duration') {
        progressLabel = criterionTarget ? `${numericValue}′ / στόχος ${criterionTarget}′` : `${numericValue}′`
      }
    }

    // Ίδιο κατώφλι/κανόνας «χωρίς μέτρηση» με το findStaleGoals του Home.jsx — reference date =
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
      isStale
    }
  })
}

export default function GoalsList({ studentId }) {
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)

  const goals = useLiveQuery(() => loadGoalsWithProgress(studentId), [studentId])

  async function changeStatus(goalId, status) {
    await db.goals.update(goalId, { status, statusChangedAt: new Date().toISOString() })
  }

  if (!goals) {
    return <p>Φόρτωση…</p>
  }

  const visible = sortByPriority(goals.filter((g) => (showAll ? true : g.status === 'active')))
  const noGoalsAtAll = goals.length === 0
  const noVisibleGoals = !noGoalsAtAll && visible.length === 0

  return (
    <div>
      <SectionHeader
        title="Στόχοι"
        action={{ label: 'Νέος στόχος', onClick: () => navigate(`/students/${studentId}/goals/new`) }}
      />

      {!noGoalsAtAll && (
        <ToggleRow checked={showAll} onChange={setShowAll} className="goals-list__toggle">
          Εμφάνιση όλων (όχι μόνο ενεργών)
        </ToggleRow>
      )}

      {noGoalsAtAll && (
        <EmptyState
          icon={Target}
          title="Δεν υπάρχουν στόχοι ακόμα"
          description="Πρόσθεσε τον πρώτο στόχο για αυτόν τον μαθητή."
          actionLabel="Νέος στόχος"
          onAction={() => navigate(`/students/${studentId}/goals/new`)}
        />
      )}

      {noVisibleGoals && (
        <EmptyState
          icon={Target}
          title="Δεν υπάρχουν ενεργοί στόχοι"
          description="Υπάρχουν στόχοι σε άλλη κατάσταση — δοκίμασε «Εμφάνιση όλων»."
          actionLabel="Εμφάνιση όλων"
          onAction={() => setShowAll(true)}
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
              priority={g.priority}
              priorityLabel={priorityLabel(g.priority)}
              status={g.status}
              statusLabel={statusLabel(g.status)}
              progressPercent={g.progressPercent}
              progressLabel={g.progressLabel}
              lastMeasuredLabel={g.lastMeasuredLabel}
              isStale={g.isStale}
              onEdit={() => navigate(`/students/${studentId}/goals/${g.id}/edit`)}
              onChangeStatus={(status) => changeStatus(g.id, status)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
