import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine
} from 'recharts'
import { db } from '../db.js'
import { domainName } from '../config/domains.js'
import { MEASUREMENT_TYPES } from '../config/measurementTypes.js'
import { priorityLabel, statusLabel } from '../config/goalOptions.js'
import { PROMPT_LEVEL_RANK } from '../config/promptLevels.js'
import { measurementNumericValue, measurementUnitLabel, parseCriterionTarget } from '../utils/measurementValue.js'
import { sessionDateMap } from '../utils/sessions.js'

// Σύντομες ετικέτες ειδικά για τον στενό άξονα Υ του γραφήματος (οι πλήρεις, π.χ. «Λεκτική υπόδειξη»,
// δεν χωράνε). Κλειδί = το value του promptLevels.js (σταθερό)· η αντιστοίχιση rank→ετικέτα παράγεται
// από το ίδιο PROMPT_LEVEL_RANK που ορίζει τις τιμές του γραφήματος, ώστε να μη διαφωνούν αν αλλάξει.
const SHORT_LABEL_BY_VALUE = { physical: 'Σωματική', verbal: 'Λεκτική', independent: 'Ανεξάρτητα' }
const PROMPT_LEVEL_RANK_TO_LABEL = Object.fromEntries(
  Object.entries(PROMPT_LEVEL_RANK).map(([value, rank]) => [rank, SHORT_LABEL_BY_VALUE[value] || value])
)

export default function GoalDetail() {
  const { id, goalId } = useParams()
  const studentId = Number(id)

  // null = «δεν έχει τρέξει ακόμα» — βλ. αντίστοιχο σχόλιο στο StudentProfile.jsx. Χωρίς αυτό, ο
  // στόχος που πραγματικά δεν υπάρχει (π.χ. διαγράφηκε ο μαθητής του) δεν θα ξεχώριζε από «φορτώνει ακόμα».
  const goal = useLiveQuery(() => db.goals.get(Number(goalId)), [goalId], null)
  const measurements = useLiveQuery(
    () => db.measurements.where('goalId').equals(Number(goalId)).toArray(),
    [goalId]
  )
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])

  if (goal === null || !measurements || !sessions) {
    return <div className="page">Φόρτωση…</div>
  }

  if (!goal) {
    return (
      <div className="page">
        <p className="empty-state">Ο στόχος δεν βρέθηκε.</p>
        <Link to={`/students/${studentId}`} className="btn btn-secondary">Πίσω στον μαθητή</Link>
      </div>
    )
  }

  const sessionDateById = sessionDateMap(sessions)

  const chartData = measurements
    .map((m) => ({
      date: sessionDateById[m.sessionId],
      value: measurementNumericValue(goal.measurementType, m.value)
    }))
    .filter((d) => d.date && d.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  const measurementTypeInfo = MEASUREMENT_TYPES.find((m) => m.value === goal.measurementType)
  const unit = measurementUnitLabel(goal.measurementType)
  const criterionTarget = parseCriterionTarget(goal.criterion, goal.measurementType)
  const isPromptLevel = goal.measurementType === 'promptLevel'

  // Το εύρος του άξονα Υ πρέπει να περιλαμβάνει πάντα τη γραμμή κριτηρίου, αλλιώς σχεδιάζεται εκτός οθόνης.
  let yDomain
  if (goal.measurementType === 'successRatio') {
    yDomain = [0, 100]
  } else if (isPromptLevel) {
    yDomain = [1, 3]
  } else {
    yDomain = [0, (dataMax) => Math.ceil(Math.max(dataMax, criterionTarget || 0, 5) * 1.1)]
  }

  return (
    <div className="page">
      <div className="top-bar">
        <Link to={`/students/${studentId}`} className="btn btn-link">← Πίσω</Link>
      </div>

      <h1>{goal.title}</h1>
      <p className="goal-domain">{domainName(goal.domain)} · {measurementTypeInfo?.label}</p>

      <div className="section">
        <p><strong>Κατάσταση:</strong> {statusLabel(goal.status)}</p>
        <p><strong>Προτεραιότητα:</strong> {priorityLabel(goal.priority)}</p>
        {goal.baseline && <p><strong>Baseline:</strong> {goal.baseline}</p>}
        {goal.criterion && <p><strong>Κριτήριο:</strong> {goal.criterion}</p>}
        {goal.description && <p><strong>Περιγραφή:</strong> {goal.description}</p>}
      </div>

      <div className="section">
        <h2>Πρόοδος μετρήσεων</h2>
        {chartData.length === 0 ? (
          <p className="empty-state">Δεν υπάρχουν ακόμα μετρήσεις για αυτόν τον στόχο.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 10, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis
                domain={yDomain}
                ticks={isPromptLevel ? [1, 2, 3] : undefined}
                tickFormatter={isPromptLevel ? (v) => PROMPT_LEVEL_RANK_TO_LABEL[v] || v : undefined}
                width={isPromptLevel ? 90 : 40}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value) => [isPromptLevel ? (PROMPT_LEVEL_RANK_TO_LABEL[value] || value) : `${value} ${unit}`, 'Τιμή']}
              />
              {criterionTarget !== null && (
                <ReferenceLine y={criterionTarget} stroke="#8a6239" strokeDasharray="4 4" label={{ value: 'Κριτήριο', position: 'right', fill: '#8a6239', fontSize: 12 }} />
              )}
              <Line type="monotone" dataKey="value" stroke="#6e8b99" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
