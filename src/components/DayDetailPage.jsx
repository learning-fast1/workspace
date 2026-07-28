import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Pencil, Plus, UserRoundPlus, Users } from 'lucide-react'
import { activeTable } from '../migration/activeGeneration.js'
import { addDays, formatDateEl, todayLocalISO } from '../utils/date.js'
import { addToQueueLinks } from '../utils/dailyQueue.js'
import { eventCategoryLabel } from '../config/scheduleOptions.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import Card from './ui/Card.jsx'
import Button from './ui/Button.jsx'
import Badge from './ui/Badge.jsx'
import TodayQueue from './TodayQueue.jsx'
import CalendarEventForm from './CalendarEventForm.jsx'
import './DayDetailPage.css'

// Λεπτομέρεια ημέρας — προσβάσιμη από οποιοδήποτε κελί του μηνιαίου ημερολογίου (Technical Plan
// §12): ΔΕΝ είναι νέο, ξεχωριστό component για την ουρά της ημέρας — είναι η ΙΔΙΑ «Η μέρα μου»
// (TodayQueue), γενικευμένη σε οποιαδήποτε ημερομηνία. Εδώ προστίθεται μόνο ό,τι η Αρχική δεν
// χρειάζεται: πλοήγηση μέρα-με-μέρα και τα γεγονότα ημερολογίου εκείνης της ημέρας.
export default function DayDetailPage() {
  const { date } = useParams()
  const navigate = useNavigate()
  const [eventFormState, setEventFormState] = useState(null) // { event? }

  const events = useLiveQuery(() => activeTable('calendarEvents').where('date').equals(date).toArray(), [date])
  const isToday = date === todayLocalISO()
  const queueLinks = addToQueueLinks(date, todayLocalISO())

  return (
    <AppShell>
      <PageHeader
        title={formatDateEl(date)}
        subtitle={isToday ? 'Σήμερα' : undefined}
        back={{ label: 'Ημερολόγιο', onClick: () => navigate('/schedule/calendar') }}
        secondaryActions={[
          { label: 'Προηγούμενη', icon: ChevronLeft, onClick: () => navigate(`/schedule/day/${addDays(date, -1)}`) },
          { label: 'Επόμενη', icon: ChevronRight, onClick: () => navigate(`/schedule/day/${addDays(date, 1)}`) }
        ]}
      />

      <div className="day-detail__events">
        <div className="day-detail__events-header">
          <h2 className="day-detail__events-title">Γεγονότα</h2>
          <Button variant="secondary" icon={Plus} onClick={() => setEventFormState({})}>Πρόσθεσε γεγονός</Button>
        </div>
        {events && events.length > 0 && (
          <div className="day-detail__events-list">
            {events.map((ev) => (
              <Card
                key={ev.id}
                variant="interactive"
                as="button"
                type="button"
                className="day-detail__event"
                onClick={() => setEventFormState({ event: ev })}
                aria-label={`Επεξεργασία ή διαγραφή — ${ev.title}`}
              >
                <span className="day-detail__event-title">{ev.title}</span>
                {ev.category && <Badge variant="neutral">{eventCategoryLabel(ev.category)}</Badge>}
                {ev.startTime && <span className="day-detail__event-time">{ev.startTime}</span>}
                <Pencil size={14} className="day-detail__event-edit-icon" aria-hidden="true" />
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Product Design (feedback χρήστη): μετακινήθηκε ΕΚΤΟΣ της κάρτας TodayQueue — εκείνη δείχνει
          πλέον ΜΟΝΟ πληροφορία (τι υπάρχει αυτή τη μέρα), καμία ενέργεια μέσα της. Ίδιο URL scheme
          με πριν (addToQueueLinks, utils/dailyQueue.js), τώρα αποδίδεται εδώ αντί μέσα στο component. */}
      <div className="day-detail__queue-actions">
        <Button variant="secondary" icon={UserRoundPlus} to={queueLinks.individual}>Έκτακτη ατομική</Button>
        <Button variant="secondary" icon={Users} to={queueLinks.group}>Έκτακτη ομαδική</Button>
      </div>

      <TodayQueue date={date} />

      {eventFormState && (
        <CalendarEventForm
          date={date}
          event={eventFormState.event}
          onClose={() => setEventFormState(null)}
          onSaved={() => {}}
        />
      )}
    </AppShell>
  )
}
