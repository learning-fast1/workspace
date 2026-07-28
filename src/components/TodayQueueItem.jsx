import { ArrowDown, ArrowUp, Ban, CircleCheck, Clock, RotateCcw, UserRound, Users, XCircle } from 'lucide-react'
import Card from './ui/Card.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import { moodOption } from '../config/moodOptions.js'
import './TodayQueueItem.css'

// Καθαρά presentational — καμία query. Μία γραμμή της «Η μέρα μου» πρέπει, με μία ματιά, να
// απαντά σε τρία ερωτήματα (Sprint 5 Product Design): ποιον βλέπω (κωδικοί + ατομικό/ομαδικό
// εικονίδιο) · τι πρέπει να κάνω μαζί του (το ΠΟΛΥ ένα `attention` σήμα) · τι έγινε ήδη σήμερα
// (ολοκληρώθηκε + διάθεση, αν καταγράφηκε).
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
export default function TodayQueueItem({
  students,
  isGroup,
  done,
  notHeld,
  mood,
  attention,
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
  const moodDef = !isGroup && mood ? moodOption(mood) : null
  const clickable = !done && !unplanned && !skipped && !readOnly
  const namesLabel = students.map((s) => s.code).join(', ')

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

      {attention && <span className="today-queue-item__attention">{attention.label}</span>}

      <span className="today-queue-item__status">
        {notHeld && <Ban size={16} className="today-queue-item__not-held-icon" aria-label="Δεν πραγματοποιήθηκε" />}
        {done && !notHeld && <CircleCheck size={18} className="today-queue-item__done-icon" aria-label="Ολοκληρώθηκε" />}
        {moodDef && <moodDef.icon size={18} aria-label={moodDef.label} />}
      </span>

      {menuItems.length > 0 && (
        <OverflowMenu ariaLabel={`Ενέργειες για ${namesLabel}`} items={menuItems} />
      )}
    </Card>
  )
}
