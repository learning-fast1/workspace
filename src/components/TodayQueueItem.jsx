import { useId, useState } from 'react'
import {
  ArrowDown, ArrowUp, Ban, CalendarClock, CircleCheck, Clock, FileText, History, PauseCircle,
  RotateCcw, Smile, Star, TrendingUp, UserRound, UserX, Users, XCircle
} from 'lucide-react'
import Card from './ui/Card.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import { moodOption } from '../config/moodOptions.js'
import './TodayQueueItem.css'

// Phase 2 Stage A — εικονίδιο ανά τύπο λόγου. Σκόπιμα ΔΙΚΟΣ ΤΟΥ μικρός χάρτης εδώ (ΟΧΙ import από
// HomeAttentionWidget.jsx) — διαφορετικό, ανεξάρτητο UI, ίδια αρχή με utils/queueAttention.js
// (ξεχωριστός υπολογισμός, καμία αντιγραφή λογικής άλλου widget). 'stale-goal' (attentionSignal.js,
// per-student) παίρνει το ΙΔΙΟ εικονίδιο με το 'stale' (goalAttention.js, per-goal) — ίδια βασική
// έννοια, βλ. σχόλιο PRIORITY_RANK στο queueAttention.js.
const REASON_ICON = {
  unresolvedSession: History,
  mood: Smile,
  absence: UserX,
  'stale-goal': CalendarClock,
  stale: CalendarClock,
  pausedTooLong: PauseCircle,
  draftReport: FileText,
  nearCriterion: TrendingUp,
  milestone: Star
}

// Καθαρά presentational — καμία query. Μία γραμμή της «Η μέρα μου» πρέπει, με μία ματιά, να
// απαντά σε τρία ερωτήματα (Sprint 5 Product Design): ποιον βλέπω (κωδικοί + ατομικό/ομαδικό
// εικονίδιο) · τι πρέπει να κάνω μαζί του (το compact attention badge, βλ. `attentionReasons`
// παρακάτω) · τι έγινε ήδη σήμερα (ολοκληρώθηκε + διάθεση, αν καταγράφηκε).
//
// Sprint 6 προσθήκες, όλες προαιρετικές/backward-compatible (η σημερινή «Η μέρα μου» της Αρχικής
// συνεχίζει να δουλεύει αμετάβλητη όταν αυτά τα props απουσιάζουν):
// - `plannedTime`/`timeState` ('now'|'soon'|null): η ώρα είναι πλέον ο κύριος οπτικός άξονας —
//   εμφανίζεται πάντα η ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΗ ώρα, αμετάβλητη ό,τι κι αν συμβεί αργότερα (Technical
//   Plan, τελευταίος γύρος σημείο 2 — καμία «πραγματική ώρα έναρξης» καταγράφεται ποτέ). Phase 2
//   Stage B: ΜΙΑ ρητή εξαίρεση — «Αλλαγή ώρας» (`onChangeTime`) ενημερώνει σκόπιμα αυτό το πεδίο
//   για τη σημερινή γραμμή, βλ. applyScheduleException στο db.js.
// - `color`: λεπτή έγχρωμη ταυτότητα μαθητή/ομάδας (utils/scheduleColor.js) — ΠΟΤΕ μοναδική
//   πηγή αναγνώρισης, πάντα μαζί με τον κωδικό.
// - `notHeld`: η γραμμή «έκλεισε» με «Δεν πραγματοποιήθηκε» αντί για πραγματική συνεδρία —
//   διακριτή, ήπια οπτική μεταχείριση, ΟΧΙ ίδια με το πράσινο ✓ του «ολοκληρώθηκε».
// - `onMarkNotHeld`/`onRestore`: η ενιαία «Επαναφορά στη σειρά» καλύπτει ΚΑΙ skip ΚΑΙ notHeld.
// - `onChangeTime` (Phase 2 Stage B): αλλαγή ώρας ΜΟΝΟ για τη σημερινή ημερομηνία — ΔΕΝ αγγίζει
//   το εβδομαδιαίο πρόγραμμα, ΔΕΝ σημαίνει notHeld (η συνεδρία συνεχίζει να πραγματοποιείται).
// - `attentionReasons` (Phase 2 Stage A): ήδη ταξινομημένο, deduped array από
//   utils/queueAttention.js (mergeQueueRowAttention) — ΕΝΑ compact badge (ο πρώτος/σημαντικότερος
//   λόγος + «+N»), expandable λεπτομέρεια για τους υπόλοιπους. Σε ομαδικές γραμμές κάθε reason
//   κουβαλάει `studentCode` (βλ. TodayQueue.jsx) — εμφανίζεται στη λεπτομέρεια ΜΟΝΟ όταν isGroup,
//   ώστε να είναι ξεκάθαρο σε ΠΟΙΟΝ μαθητή ανήκει (review χρήστη).
export default function TodayQueueItem({
  students,
  isGroup,
  done,
  notHeld,
  mood,
  attentionReasons = [],
  skipped,
  unplanned,
  plannedTime,
  timeState,
  timeLabel,
  color,
  readOnly,
  onOpen,
  onSkip,
  onRestore,
  onMarkNotHeld,
  onMove,
  onChangeTime,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown
}) {
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const detailsId = useId()
  const moodDef = !isGroup && mood ? moodOption(mood) : null
  const clickable = !done && !unplanned && !skipped && !readOnly
  const namesLabel = students.map((s) => s.code).join(', ')
  const [topReason, ...restReasons] = attentionReasons
  const TopIcon = topReason ? REASON_ICON[topReason.type] : null

  const menuItems = []
  if (!done && !unplanned) {
    menuItems.push(
      skipped
        ? { label: 'Επαναφορά στη σειρά', icon: RotateCcw, onClick: onRestore }
        : { label: 'Παράλειψη σήμερα', icon: XCircle, onClick: onSkip }
    )
    if (!skipped && onMarkNotHeld) {
      menuItems.push({ label: 'Δεν πραγματοποιήθηκε', icon: Ban, onClick: onMarkNotHeld, variant: 'danger' })
    }
    if (!skipped && onChangeTime) {
      menuItems.push({ label: 'Αλλαγή ώρας', icon: Clock, onClick: onChangeTime })
    }
    if (!skipped && onMove) {
      menuItems.push({ label: 'Μετακίνηση σε άλλη μέρα', icon: ArrowUp, onClick: onMove })
    }
    if (canMoveUp) menuItems.push({ label: 'Μετακίνηση πάνω στη σειρά', icon: ArrowUp, onClick: onMoveUp })
    if (canMoveDown) menuItems.push({ label: 'Μετακίνηση κάτω στη σειρά', icon: ArrowDown, onClick: onMoveDown })
  } else if (notHeld && onRestore) {
    menuItems.push({ label: 'Επαναφορά στη σειρά', icon: RotateCcw, onClick: onRestore })
  }

  return (
    <Card
      variant={clickable ? 'interactive' : 'default'}
      className={`today-queue-item ${skipped ? 'today-queue-item--skipped' : ''} ${done ? 'today-queue-item--done' : ''} ${notHeld ? 'today-queue-item--not-held' : ''}`}
      style={color ? { '--slot-color': color } : undefined}
    >
      {color && <span className="today-queue-item__color" aria-hidden="true" />}

      <div className="today-queue-item__row">
        {clickable && (
          <button
            type="button"
            className="stretched-link today-queue-item__open"
            onClick={onOpen}
            aria-label={`Ξεκίνα συνεδρία — ${namesLabel}`}
          />
        )}

        {plannedTime && (
          <span className={`today-queue-item__time ${timeState ? `today-queue-item__time--${timeState}` : ''}`}>
            {plannedTime}
            {timeLabel && (
              <span className={`today-queue-item__time-tag ${timeState === 'overdue' ? 'today-queue-item__time-tag--overdue' : ''}`}>
                {timeLabel}
              </span>
            )}
          </span>
        )}

        <span className="today-queue-item__icon" aria-hidden="true">
          {isGroup ? <Users size={16} /> : <UserRound size={16} />}
        </span>

        <span className="today-queue-item__names">{namesLabel}</span>

        {topReason && (
          <button
            type="button"
            className="today-queue-item__attention-badge"
            aria-expanded={detailsExpanded}
            aria-controls={detailsId}
            onClick={() => setDetailsExpanded((v) => !v)}
          >
            {TopIcon && <TopIcon size={14} aria-hidden="true" />}
            <span className="today-queue-item__attention-label">{topReason.label}</span>
            {restReasons.length > 0 && <span className="today-queue-item__attention-count">+{restReasons.length}</span>}
          </button>
        )}

        <span className="today-queue-item__status">
          {notHeld && <Ban size={16} className="today-queue-item__not-held-icon" aria-label="Δεν πραγματοποιήθηκε" />}
          {done && !notHeld && <CircleCheck size={18} className="today-queue-item__done-icon" aria-label="Ολοκληρώθηκε" />}
          {moodDef && <moodDef.icon size={18} aria-label={moodDef.label} />}
        </span>

        {menuItems.length > 0 && (
          <OverflowMenu ariaLabel={`Ενέργειες για ${namesLabel}`} items={menuItems} />
        )}
      </div>

      {topReason && detailsExpanded && (
        <ul id={detailsId} className="today-queue-item__attention-details">
          {attentionReasons.map((r, i) => {
            const Icon = REASON_ICON[r.type]
            return (
              <li key={i}>
                {Icon && <Icon size={13} aria-hidden="true" />}
                {isGroup && r.studentCode ? `${r.studentCode}: ${r.label}` : r.label}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
