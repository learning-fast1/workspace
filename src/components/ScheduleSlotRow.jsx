import { Pause, Pencil, Play, Trash2, UserRound, Users } from 'lucide-react'
import Card from './ui/Card.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import { colorForIdentity } from '../utils/scheduleColor.js'
import './ScheduleSlotRow.css'

// Μία γραμμή σταθερού slot στο εβδομαδιαίο πρότυπο (Sprint 6) — καθαρά presentational, καμία
// query. Η ώρα είναι σκόπιμα το πιο εμφανές στοιχείο (Product Design, αναθεωρημένος γύρος:
// «η ώρα να αναδεικνύεται περισσότερο οπτικά»). Η έγχρωμη ταυτότητα είναι λεπτή γραμμή στην άκρη
// της κάρτας — ΠΟΤΕ γέμισμα φόντου (θα συγκρουόταν οπτικά με τα σημασιολογικά χρώματα κατάστασης).
export default function ScheduleSlotRow({ slot, namesLabel, onEdit, onTogglePause, onDelete }) {
  const color = colorForIdentity(slot.studentIds)
  const isGroup = slot.studentIds.length > 1

  const menuItems = [
    { label: 'Επεξεργασία', icon: Pencil, onClick: onEdit },
    slot.active
      ? { label: 'Παύση', icon: Pause, onClick: onTogglePause }
      : { label: 'Ενεργοποίηση', icon: Play, onClick: onTogglePause },
    { label: 'Διαγραφή', icon: Trash2, onClick: onDelete, variant: 'danger' }
  ]

  return (
    <Card
      variant="default"
      className={`schedule-slot-row ${!slot.active ? 'schedule-slot-row--paused' : ''}`}
      style={{ '--slot-color': color }}
    >
      <span className="schedule-slot-row__color" aria-hidden="true" />
      <span className="schedule-slot-row__time-block">
        <span className="schedule-slot-row__time">{slot.startTime}</span>
        <span className="schedule-slot-row__duration">{slot.durationMinutes}′</span>
      </span>
      <span className="schedule-slot-row__body">
        <span className="schedule-slot-row__names">
          {isGroup ? <Users size={14} aria-hidden="true" /> : <UserRound size={14} aria-hidden="true" />}
          {namesLabel}
        </span>
        {slot.label && <span className="schedule-slot-row__label">{slot.label}</span>}
        {!slot.active && <span className="schedule-slot-row__paused-tag">Σε παύση</span>}
      </span>
      <OverflowMenu ariaLabel={`Ενέργειες για ${namesLabel}, ${slot.startTime}`} items={menuItems} />
    </Card>
  )
}
