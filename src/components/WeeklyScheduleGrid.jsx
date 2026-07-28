import { UserRound, Users } from 'lucide-react'
import { WEEKDAYS_MON_FRI } from '../config/scheduleOptions.js'
import { colorForIdentity } from '../utils/scheduleColor.js'
import { computeWeekGridLayout, hourMarks, GRID_PIXELS_PER_MINUTE } from '../utils/scheduleGridLayout.js'
import './WeeklyScheduleGrid.css'

// Weekly Grid (δεύτερη όψη μέσα στο SchedulePage, review χρήστη) — ΚΑΘΑΡΑ presentational πάνω στο
// ΙΔΙΟ currentSlots dataset της λίστας (καμία δική του query, καμία scheduleExceptions ανάγνωση,
// κανένας occurrence resolver — βλ. utils/scheduleGridLayout.js). Read-only ως προς τη διάταξη: η
// ΜΟΝΗ ενέργεια είναι άνοιγμα του ήδη υπάρχοντος ScheduleSlotForm μέσω onEditSlot — ΚΑΝΕΝΑ
// click-on-empty-cell, ΚΑΝΕΝΑ drag-and-drop (review χρήστη, ρητά εκτός αυτού του stage).
//
// Responsive: ΙΔΙΟ μηχανισμό με το SchedulePage's λίστα — όλες οι 5 ημέρες αποδίδονται πάντα, το
// CSS κρύβει τις μη επιλεγμένες <1024px μέσω .weekly-grid__day--inactive (καμία ξεχωριστή JS
// διακλάδωση tablet/mobile).
export default function WeeklyScheduleGrid({ slots, studentById, selectedDay, onEditSlot }) {
  const dayValues = WEEKDAYS_MON_FRI.map((d) => d.value)
  const { bounds, blocksByDay } = computeWeekGridLayout(slots, dayValues)
  const marks = hourMarks(bounds)
  const trackHeight = (bounds.endMinutes - bounds.startMinutes) * GRID_PIXELS_PER_MINUTE

  function namesFor(slot) {
    return slot.studentIds.map((id) => studentById[id]?.code).filter(Boolean).join(', ')
  }

  return (
    <div className="weekly-grid">
      <div className="weekly-grid__axis" style={{ height: trackHeight }} aria-hidden="true">
        {marks.map((mark) => (
          <span
            key={mark.minutes}
            className="weekly-grid__axis-mark"
            style={{ top: (mark.minutes - bounds.startMinutes) * GRID_PIXELS_PER_MINUTE }}
          >
            {mark.label}
          </span>
        ))}
      </div>

      <div className="weekly-grid__days">
        {WEEKDAYS_MON_FRI.map((day) => (
          <div
            key={day.value}
            className={`weekly-grid__day ${day.value !== selectedDay ? 'weekly-grid__day--inactive' : ''}`}
          >
            <h2 className="weekly-grid__day-title">{day.label}</h2>
            <div className="weekly-grid__track" style={{ height: trackHeight }}>
              {marks.map((mark) => (
                <span
                  key={mark.minutes}
                  className="weekly-grid__gridline"
                  style={{ top: (mark.minutes - bounds.startMinutes) * GRID_PIXELS_PER_MINUTE }}
                  aria-hidden="true"
                />
              ))}
              {blocksByDay[day.value].map((block) => {
                const { slot } = block
                const isGroup = slot.studentIds.length > 1
                const namesLabel = namesFor(slot)
                const widthPercent = 100 / block.columnCount
                return (
                  <button
                    key={slot.id}
                    type="button"
                    className="weekly-grid__block"
                    style={{
                      top: block.topMinutes * GRID_PIXELS_PER_MINUTE,
                      height: block.heightMinutes * GRID_PIXELS_PER_MINUTE,
                      left: `${block.columnIndex * widthPercent}%`,
                      width: `${widthPercent}%`,
                      '--slot-color': colorForIdentity(slot.studentIds)
                    }}
                    onClick={() => onEditSlot(slot)}
                    aria-label={`Επεξεργασία: ${namesLabel}, ${day.label} ${slot.startTime}, ${slot.durationMinutes}′`}
                  >
                    <span className="weekly-grid__block-icon" aria-hidden="true">
                      {isGroup ? <Users size={12} /> : <UserRound size={12} />}
                    </span>
                    <span className="weekly-grid__block-names">{namesLabel}</span>
                    <span className="weekly-grid__block-time">{slot.startTime}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
