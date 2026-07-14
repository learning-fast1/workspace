import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine
} from 'recharts'
import { LineChart as LineChartIcon, UserX } from 'lucide-react'
import { db } from '../db.js'
import { domainName } from '../config/domains.js'
import { MEASUREMENT_TYPES } from '../config/measurementTypes.js'
import { priorityLabel, statusLabel, PRIORITY_BADGE_VARIANT, STATUS_BADGE_VARIANT } from '../config/goalOptions.js'
import { PROMPT_LEVEL_RANK } from '../config/promptLevels.js'
import { measurementNumericValue, measurementUnitLabel, parseCriterionTarget } from '../utils/measurementValue.js'
import { sessionDateMap } from '../utils/sessions.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import EmptyState from './ui/EmptyState.jsx'
import SessionModal from './SessionModal.jsx'
import './GoalDetail.css'

// Σύντομες ετικέτες ειδικά για τον στενό άξονα Υ του γραφήματος (οι πλήρεις, π.χ. «Λεκτική υπόδειξη»,
// δεν χωράνε). Κλειδί = το value του promptLevels.js (σταθερό)· η αντιστοίχιση rank→ετικέτα παράγεται
// από το ίδιο PROMPT_LEVEL_RANK που ορίζει τις τιμές του γραφήματος, ώστε να μη διαφωνούν αν αλλάξει.
const SHORT_LABEL_BY_VALUE = { physical: 'Σωματική', verbal: 'Λεκτική', independent: 'Ανεξάρτητα' }
const PROMPT_LEVEL_RANK_TO_LABEL = Object.fromEntries(
  Object.entries(PROMPT_LEVEL_RANK).map(([value, rank]) => [rank, SHORT_LABEL_BY_VALUE[value] || value])
)

// Σημείο του γραφήματος με δικό του click — ανοίγει τις λεπτομέρειες της συνεδρίας στην οποία
// μετρήθηκε (reuse του SessionDetailModal, όχι δεύτερη υλοποίηση). recharts κλωνοποιεί αυτό το
// στοιχείο ανά data point, προσθέτοντας αυτόματα cx/cy/payload.
function ClickableDot({ cx, cy, payload, onSelect }) {
  if (cx == null || cy == null) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill="var(--color-primary)"
      stroke="#fff"
      strokeWidth={1.5}
      className="goal-detail__chart-dot"
      onClick={() => onSelect(payload.sessionId)}
      role="button"
      tabIndex={0}
      aria-label={`Άνοιγμα συνεδρίας ${payload.date}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(payload.sessionId) }}
    />
  )
}

export default function GoalDetail() {
  const { id, goalId } = useParams()
  const navigate = useNavigate()
  const studentId = Number(id)
  const [viewingSessionId, setViewingSessionId] = useState(null)

  // null = «δεν έχει τρέξει ακόμα» — βλ. αντίστοιχο σχόλιο στο StudentProfile.jsx. Χωρίς αυτό, ο
  // στόχος που πραγματικά δεν υπάρχει (π.χ. διαγράφηκε ο μαθητής του) δεν θα ξεχώριζε από «φορτώνει ακόμα».
  const goal = useLiveQuery(() => db.goals.get(Number(goalId)), [goalId], null)
  const measurements = useLiveQuery(
    () => db.measurements.where('goalId').equals(Number(goalId)).toArray(),
    [goalId]
  )
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])

  if (goal === null || !measurements || !sessions) {
    return (
      <AppShell>
        <p>Φόρτωση…</p>
      </AppShell>
    )
  }

  if (!goal) {
    return (
      <AppShell>
        <EmptyState
          icon={UserX}
          title="Ο στόχος δεν βρέθηκε"
          description="Μπορεί να διαγράφηκε ή ο σύνδεσμος να μην είναι πια έγκυρος."
          actionLabel="Επιστροφή στον μαθητή"
          actionTo={`/students/${studentId}`}
        />
      </AppShell>
    )
  }

  const sessionDateById = sessionDateMap(sessions)

  const chartData = measurements
    .map((m) => ({
      date: sessionDateById[m.sessionId],
      sessionId: m.sessionId,
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
    <AppShell>
      <PageHeader
        title={goal.title}
        subtitle={`${domainName(goal.domain)} · ${measurementTypeInfo?.label || ''}`}
        back={{ label: 'Πίσω στον μαθητή', onClick: () => navigate(`/students/${studentId}`) }}
      />

      <Card className="goal-detail__info">
        <div className="goal-detail__badges">
          <Badge variant={PRIORITY_BADGE_VARIANT[goal.priority] || 'neutral'}>{priorityLabel(goal.priority)}</Badge>
          <Badge variant={STATUS_BADGE_VARIANT[goal.status] || 'neutral'}>{statusLabel(goal.status)}</Badge>
        </div>
        {goal.baseline && <p><strong>Baseline:</strong> {goal.baseline}</p>}
        {goal.criterion && <p><strong>Κριτήριο:</strong> {goal.criterion}</p>}
        {goal.description && <p><strong>Περιγραφή:</strong> {goal.description}</p>}
      </Card>

      <Card className="goal-detail__chart-card">
        <h2 className="goal-detail__chart-title">Πρόοδος μετρήσεων</h2>
        {chartData.length === 0 ? (
          <EmptyState
            icon={LineChartIcon}
            title="Δεν υπάρχουν ακόμα μετρήσεις"
            description="Το γράφημα θα γεμίσει μόλις καταγραφούν μετρήσεις για αυτόν τον στόχο."
          />
        ) : (
          <>
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
                  <ReferenceLine y={criterionTarget} stroke="var(--color-warning)" strokeDasharray="4 4" label={{ value: 'Κριτήριο', position: 'right', fill: 'var(--color-warning)', fontSize: 12 }} />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={<ClickableDot onSelect={setViewingSessionId} />}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="goal-detail__chart-hint">Πάτησε σε ένα σημείο για να δεις τη συνεδρία στην οποία μετρήθηκε.</p>
          </>
        )}
      </Card>

      {viewingSessionId && (
        <SessionModal sessionId={viewingSessionId} onClose={() => setViewingSessionId(null)} />
      )}
    </AppShell>
  )
}
