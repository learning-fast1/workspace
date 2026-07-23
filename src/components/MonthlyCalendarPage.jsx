import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { activeTable } from '../migration/activeGeneration.js'
import { toLocalISO, todayLocalISO } from '../utils/date.js'
import { projectOccurrencesForDate } from '../utils/scheduleGeneration.js'
import { WEEKDAYS } from '../config/scheduleOptions.js'
import { CALENDAR_EVENT_CATEGORIES } from '../config/scheduleOptions.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import Button from './ui/Button.jsx'
import './MonthlyCalendarPage.css'

const MONTH_NAMES = [
  'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
  'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'
]

// Σειρά στηλών Δε→Κυ (ελληνική σύμβαση εβδομάδας) — WEEKDAYS είναι Κυ-πρώτα (JS convention),
// εδώ απλά αναδιατάσσουμε για εμφάνιση.
const GRID_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function monthGridDates(year, month) {
  const firstOfMonth = new Date(year, month, 1)
  const offset = (firstOfMonth.getDay() + 6) % 7 // Δευτέρα = 0
  const gridStart = new Date(year, month, 1 - offset)
  const dates = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    dates.push(toLocalISO(d))
  }
  return dates
}

async function loadMonthData(year, month) {
  const dates = monthGridDates(year, month)
  const [scheduleSlots, scheduleExceptions, calendarEvents, dailyQueueRows, sessions] = await Promise.all([
    activeTable('scheduleSlots').toArray(),
    activeTable('scheduleExceptions').toArray(),
    activeTable('calendarEvents').where('date').between(dates[0], dates[41], true, true).toArray(),
    activeTable('dailyQueue').where('date').between(dates[0], dates[41], true, true).toArray(),
    activeTable('sessions').where('date').between(dates[0], dates[41], true, true).toArray()
  ])

  const today = todayLocalISO()
  const cells = dates.map((date) => {
    // Σήμερα/μέλλον: read-only προβολή του προτύπου (καμία εγγραφή — Technical Plan §14).
    // Περασμένη μέρα: πραγματικά δεδομένα (τι όντως έγινε/είχε προγραμματιστεί), ΟΧΙ αναδρομική
    // προβολή του τρέχοντος προτύπου.
    const occurrenceCount = date >= today
      ? projectOccurrencesForDate(date, { scheduleSlots, scheduleExceptions }).length
      : Math.max(dailyQueueRows.filter((e) => e.date === date).length, sessions.filter((s) => s.date === date).length)
    const eventsForDate = calendarEvents.filter((e) => e.date === date)
    return { date, occurrenceCount, events: eventsForDate }
  })

  return { cells, dates }
}

export default function MonthlyCalendarPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const data = useLiveQuery(() => loadMonthData(year, month), [year, month])

  function changeMonth(delta) {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setMonth(m); setYear(y)
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  const todayIso = todayLocalISO()

  return (
    <AppShell>
      <PageHeader
        title="Μηνιαίο ημερολόγιο"
        back={{ label: 'Πρόγραμμα', onClick: () => navigate('/schedule') }}
        secondaryActions={[{ label: 'Σήμερα', onClick: goToday }]}
      />

      <div className="monthly-calendar__nav">
        <Button variant="ghost" icon={ChevronLeft} ariaLabel="Προηγούμενος μήνας" onClick={() => changeMonth(-1)} />
        <h2 className="monthly-calendar__month-label">{MONTH_NAMES[month]} {year}</h2>
        <Button variant="ghost" icon={ChevronRight} ariaLabel="Επόμενος μήνας" onClick={() => changeMonth(1)} />
      </div>

      <div className="monthly-calendar__weekday-row">
        {GRID_WEEKDAY_ORDER.map((w) => (
          <span key={w} className="monthly-calendar__weekday">{WEEKDAYS[w].short}</span>
        ))}
      </div>

      {data && (
        <div className="monthly-calendar__grid">
          {data.cells.map((cell) => {
            const dayNumber = Number(cell.date.slice(8, 10))
            const inMonth = Number(cell.date.slice(5, 7)) === month + 1
            const isToday = cell.date === todayIso

            // Μικρές, χρωματιστές ετικέτες με πραγματικό τίτλο αντί για αφηρημένες τελείες
            // (Sprint 6 διόρθωση) — πρώτα τα γεγονότα (πιο συγκεκριμένα/σημαντικά), μετά μία
            // συγκεντρωτική ετικέτα «Ν συνεδρίες» αν υπάρχουν προγραμματισμένες εμφανίσεις.
            // Έως 2 ορατές, οι υπόλοιπες συνοψίζονται σε «+Χ ακόμη» — καμία απόπειρα να χωρέσουν
            // όλες, το κελί μένει σκόπιμα μικρό (η πλήρης εικόνα είναι στη λεπτομέρεια ημέρας).
            const labels = [
              ...cell.events.map((e) => ({
                text: e.title,
                variant: CALENDAR_EVENT_CATEGORIES.find((c) => c.value === e.category)?.variant || 'neutral'
              })),
              ...(cell.occurrenceCount > 0
                ? [{ text: `${cell.occurrenceCount} συνεδρί${cell.occurrenceCount === 1 ? 'α' : 'ες'}`, variant: 'primary' }]
                : [])
            ]
            const visibleLabels = labels.slice(0, 2)
            const hiddenCount = labels.length - visibleLabels.length

            return (
              <button
                key={cell.date}
                type="button"
                className={`monthly-calendar__cell ${!inMonth ? 'monthly-calendar__cell--outside' : ''} ${isToday ? 'monthly-calendar__cell--today' : ''}`}
                onClick={() => navigate(`/schedule/day/${cell.date}`)}
              >
                <span className="monthly-calendar__cell-number">{dayNumber}</span>
                <span className="monthly-calendar__cell-labels">
                  {visibleLabels.map((label, i) => (
                    <span key={i} className={`monthly-calendar__label monthly-calendar__label--${label.variant}`}>
                      {label.text}
                    </span>
                  ))}
                  {hiddenCount > 0 && <span className="monthly-calendar__label-more">+{hiddenCount} ακόμη</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
