import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine
} from 'recharts'
import { LineChart as LineChartIcon, MessageSquareText, UserX } from 'lucide-react'
import { db } from '../db.js'
import { domainName } from '../config/domains.js'
import { getMeasurementType, formatRecordedValue } from '../utils/measurementTypes/index.js'
import { priorityLabel, statusLabel, PRIORITY_BADGE_VARIANT, STATUS_BADGE_VARIANT } from '../config/goalOptions.js'
import { PROMPT_LEVEL_RANK } from '../config/promptLevels.js'
import { measurementNumericValue, measurementUnitLabel, parseCriterionTarget } from '../utils/measurementValue.js'
import { sessionDateMap } from '../utils/sessions.js'
import { buildGoalHistoryFeed } from '../utils/goalHistory.js'
import { formatDateEl } from '../utils/date.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import EmptyState from './ui/EmptyState.jsx'
import ActivityItem from './ui/ActivityItem.jsx'
import SessionModal from './SessionModal.jsx'
import './GoalDetail.css'

// Σύντομες ετικέτες ειδικά για τον στενό άξονα Υ του γραφήματος (οι πλήρεις, π.χ. «Λεκτική υπόδειξη»,
// δεν χωράνε). Κλειδί = το value του promptLevels.js (σταθερό)· η αντιστοίχιση rank→ετικέτα παράγεται
// από το ίδιο PROMPT_LEVEL_RANK που ορίζει τις τιμές του γραφήματος, ώστε να μη διαφωνούν αν αλλάξει.
const SHORT_LABEL_BY_VALUE = { physical: 'Σωματική', verbal: 'Λεκτική', independent: 'Ανεξάρτητα' }
const PROMPT_LEVEL_RANK_TO_LABEL = Object.fromEntries(
  Object.entries(PROMPT_LEVEL_RANK).map(([value, rank]) => [rank, SHORT_LABEL_BY_VALUE[value] || value])
)

// Σημείο του γραφήματος — ανοίγει τις λεπτομέρειες της συνεδρίας στην οποία μετρήθηκε (reuse του
// SessionModal, όχι δεύτερη υλοποίηση). recharts κλωνοποιεί αυτό το στοιχείο ανά data point,
// προσθέτοντας αυτόματα cx/cy/payload· χρησιμοποιείται και για το κανονικό dot και για το activeDot.
//
// ΣΗΜΑΝΤΙΚΟ: το ίδιο το circle ΔΕΝ έχει πλέον onClick για mouse/touch — το recharts διατηρεί ένα
// δικό του, αόρατο, εσωτερικό tracking layer (για το Tooltip) που παραμένει από πάνω σε "active"
// σημεία και καταναλώνει το pointer event πριν φτάσει σε ΟΠΟΙΟΔΗΠΟΤΕ δικό μας DOM element εκεί
// (επιβεβαιώθηκε: ούτε το activeDot prop το λύνει, το πρόβλημα είναι πιο βαθιά στο recharts, όχι
// στο ποιο δικό μας layer είναι "από πάνω"). Το mouse/touch click χειρίζεται πλέον στο επίπεδο του
// ίδιου του LineChart (onClick + activePayload παρακάτω) — η ΙΔΙΑ μηχανή εντοπισμού "ποιο σημείο
// είναι πλησιέστερο" που το recharts ήδη χρησιμοποιεί αξιόπιστα για το Tooltip, άρα εξίσου αξιόπιστη
// και για το click. Το tabIndex/onKeyDown παραμένει ΕΔΩ (όχι στο chart-level onClick) — το πληκτρολόγιο
// δεν περνάει από το ίδιο pointer-tracking layer, οπότε δεν έχει το ίδιο πρόβλημα και δουλεύει κανονικά.
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
      role="button"
      tabIndex={0}
      aria-label={`Άνοιγμα συνεδρίας ${payload.date}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(payload.sessionId)
        }
      }}
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
  // Ένα μόνο, φθηνό query — ήδη scoped σε ΕΝΑΝ στόχο (goalId indexed), όχι σε όλους τους στόχους
  // του μαθητή, άρα δεν υπάρχει θέμα N+1 εδώ (Technical Plan Στάδιο 5, σημείο 6).
  const goalEvents = useLiveQuery(
    () => db.goalEvents.where('goalId').equals(Number(goalId)).toArray(),
    [goalId]
  )
  // Κλινικές εκτιμήσεις (Teaching Mode) — συμπληρωματικές του measurement, μέχρι πρότινος αόρατες
  // εκτός βάσης· τώρα τροφοδοτούν το ενοποιημένο ιστορικό παρακάτω (utils/goalHistory.js).
  const assessments = useLiveQuery(
    () => db.sessionGoalAssessments.where('goalId').equals(Number(goalId)).toArray(),
    [goalId]
  )

  if (goal === null || !measurements || !sessions || !goalEvents || !assessments) {
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

  // Μοναδική πηγή αλήθειας για το label (registry) — πριν χρησιμοποιούσε ξεχωριστό, ξεχασμένο
  // config/measurementTypes.js με ΔΙΑΦΟΡΕΤΙΚΗ ονομασία («Ανάλυση εργασίας (βήματα)» αντί για
  // «Βήματα εργασίας» του Wizard) ΚΑΙ μόνο 4 από τους 8 τύπους (Minor UX Polish, bug report).
  const measurementTypeInfo = getMeasurementType(goal.measurementType)
  const unit = measurementUnitLabel(goal.measurementType)
  const criterionTarget = parseCriterionTarget(goal.criterion, goal.measurementType)
  const isPromptLevel = goal.measurementType === 'promptLevel'
  // Υπάρχουν μετρήσεις, αλλά ΚΑΜΙΑ δεν παρήγαγε αριθμητικό σημείο γραφήματος (measurementNumericValue
  // δεν υποστηρίζει τον τύπο — π.χ. narrative/checklist/ratingScale/frequency σήμερα) → ο τύπος
  // ΔΕΝ είναι χαρτογραφήσιμος, το γράφημα κρύβεται εντελώς (το ενοποιημένο Ιστορικό παρακάτω γίνεται
  // η μοναδική πηγή) αντί για το παραπλανητικό «Δεν υπάρχουν ακόμα μετρήσεις». Παράγεται ΔΥΝΑΜΙΚΑ
  // (όχι hardcoded λίστα τύπων) — αν αργότερα το measurementNumericValue επεκταθεί (π.χ. Stage 9β),
  // αυτή η συνθήκη διορθώνεται αυτόματα, χωρίς νέο άγγιγμα εδώ.
  const chartTypeUnsupported = measurements.length > 0 && chartData.length === 0

  // Περιγραφική παρατήρηση (bug report) — ΔΕΝ είναι απλώς «μη χαρτογραφήσιμος τύπος» σαν τους
  // υπόλοιπους (checklist/ratingScale/frequency): κατά το Product Design είναι ο ΜΟΝΑΔΙΚΟΣ τύπος
  // χωρίς καμία έννοια ποσοτικής προόδου εξ ορισμού, ρητά προοριζόμενος για διαφορετική παρουσίαση
  // (χρονολογική λίστα παρατηρήσεων, όχι γράφημα) — ΟΧΙ απλώς κρυφό γράφημα σαν τους άλλους. Γι'
  // αυτό εδώ ΕΙΝΑΙ σωστό να ελέγχεται ρητά ο τύπος, σε αντίθεση με το chartTypeUnsupported παραπάνω
  // (που παραμένει σκόπιμα δυναμικό/type-agnostic).
  const isNarrative = goal.measurementType === 'narrative'
  const narrativeEntries = isNarrative
    ? measurements
        .map((m) => ({ id: m.id, date: sessionDateById[m.sessionId], text: formatRecordedValue('narrative', m.value, goal.criterionConfig) }))
        .filter((n) => n.date)
        .sort((a, b) => b.date.localeCompare(a.date)) // πιο πρόσφατα πρώτα, ίδια σύμβαση με το Ιστορικό παρακάτω
    : []

  const historyEntries = buildGoalHistoryFeed(goal, {
    goalEvents,
    measurements,
    assessments,
    sessionDateById
  })

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
        {goal.baseline && <p><strong>Σημείο εκκίνησης:</strong> {goal.baseline}</p>}
        {goal.criterion && <p className="goal-detail__criterion"><strong>Κριτήριο:</strong> {goal.criterion}</p>}
        {goal.description && <p><strong>Περιγραφή:</strong> {goal.description}</p>}
      </Card>

      {!chartTypeUnsupported && !isNarrative && (
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
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 60, left: 0, bottom: 0 }}
                onClick={(state) => {
                  const sessionId = state?.activePayload?.[0]?.payload?.sessionId
                  if (sessionId) setViewingSessionId(sessionId)
                }}
              >
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
                  // Το recharts αποδίδει ΞΕΧΩΡΙΣΤΟ "active dot" layer πάνω από το κανονικό dot όταν ένα
                  // σημείο γίνεται hover/active (για το Tooltip) — χωρίς δικό του activeDot, αυτό το
                  // layer καταναλώνει το pointer event πριν φτάσει στο δικό μας onClick, κάνοντας το
                  // κλικ αναξιόπιστο (επιβεβαιώθηκε live: raw κλικ στις συντεταγμένες του dot δεν
                  // άνοιγε το modal). Ίδιο component και στα δύο — ό,τι layer βρίσκεται από πάνω τη
                  // δεδομένη στιγμή, ανταποκρίνεται με το ίδιο onClick/onKeyDown.
                  dot={<ClickableDot onSelect={setViewingSessionId} />}
                  activeDot={<ClickableDot onSelect={setViewingSessionId} />}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="goal-detail__chart-hint">Πάτησε σε ένα σημείο για να δεις τη συνεδρία στην οποία μετρήθηκε.</p>
          </>
        )}
      </Card>
      )}

      {isNarrative && (
        <Card className="goal-detail__narrative-card">
          <h2 className="goal-detail__chart-title">Παρατηρήσεις συνεδριών</h2>
          {narrativeEntries.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="Δεν υπάρχουν ακόμη αφηγηματικές παρατηρήσεις."
              description="Θα εμφανίζονται εδώ, σε χρονολογική σειρά, μόλις καταγραφούν σε συνεδρία."
            />
          ) : (
            <div className="goal-detail__narrative-items">
              {narrativeEntries.map((n) => (
                <div key={n.id} className="goal-detail__narrative-item">
                  <p className="goal-detail__narrative-date">{formatDateEl(n.date)}</p>
                  <p className="goal-detail__narrative-text">{n.text}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="goal-detail__history-card">
        <h2 className="goal-detail__chart-title">Ιστορικό</h2>
        {historyEntries.length === 0 ? (
          <p className="goal-detail__history-empty">Δεν υπάρχει ακόμα καταγεγραμμένο ιστορικό για αυτόν τον στόχο.</p>
        ) : (
          <div className="goal-detail__history-items">
            {historyEntries.map((entry) => (
              <ActivityItem
                key={entry.key}
                icon={entry.icon}
                text={entry.text}
                dateLabel={formatDateEl(entry.date)}
                kind={entry.kind}
                onClick={entry.sessionId ? () => setViewingSessionId(entry.sessionId) : undefined}
              />
            ))}
          </div>
        )}
      </Card>

      {viewingSessionId && (
        <SessionModal sessionId={viewingSessionId} onClose={() => setViewingSessionId(null)} />
      )}
    </AppShell>
  )
}
