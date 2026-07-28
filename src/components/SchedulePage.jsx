import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, Copy, Plus } from 'lucide-react'
import { pauseScheduleSlot, endScheduleSlotSeries, copyScheduleDay } from '../db.js'
import { activeTable } from '../migration/activeGeneration.js'
import { todayLocalISO } from '../utils/date.js'
import { WEEKDAYS_MON_FRI, weekdayLabel } from '../config/scheduleOptions.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import Tabs from './ui/Tabs.jsx'
import ScheduleSlotRow from './ScheduleSlotRow.jsx'
import ScheduleSlotForm from './ScheduleSlotForm.jsx'
import WeeklyScheduleGrid from './WeeklyScheduleGrid.jsx'
import './SchedulePage.css'

// Weekly Grid (Phase 2) — δεύτερη όψη ΜΕΣΑ σε αυτή τη σελίδα, ΟΧΙ ξεχωριστό route (review χρήστη:
// καμία πραγματική αρχιτεκτονική ανάγκη για δικό του URL). Ίδιο ΑΚΡΙΒΩΣ dataset (currentSlots/
// studentById) με τη λίστα — καμία νέα query, καμία ανάγνωση scheduleExceptions, κανένας
// occurrence resolver (βλ. utils/scheduleGridLayout.js). Προεπιλογή ΠΑΝΤΑ «Λίστα» — η επιλογή ΔΕΝ
// αποθηκεύεται (καμία αλλαγή σε preferences/localStorage/database σε αυτό το stage).
const VIEW_MODE_TABS = [{ id: 'list', label: 'Λίστα' }, { id: 'grid', label: 'Πλέγμα' }]

// «Πρόγραμμα» ανοίγει κατευθείαν στο εβδομαδιαίο πρότυπο — όχι στο μηνιαίο ημερολόγιο (Product
// Design, τελευταία αναθεώρηση): το πρότυπο είναι ο πραγματικός πυρήνας (ρύθμιση, σπάνια
// επίσκεψη), το ημερολόγιο δευτερεύον, μία σαφής ενέργεια μακριά. Καμία «Νέα συνεδρία»-τύπου
// μόνιμη οθόνη — η καθημερινή ροή παραμένει εξ ολοκλήρου στην Αρχική/«Η μέρα μου» (Technical
// Plan guardrail: καμία πρόσθετη πολυπλοκότητα στην καθημερινή χρήση).
async function loadScheduleData() {
  const [allSlots, students] = await Promise.all([activeTable('scheduleSlots').toArray(), activeTable('students').toArray()])
  const today = todayLocalISO()

  const bySeries = new Map()
  for (const s of allSlots) {
    if (!bySeries.has(s.seriesId)) bySeries.set(s.seriesId, [])
    bySeries.get(s.seriesId).push(s)
  }
  const currentSlots = []
  for (const versions of bySeries.values()) {
    const active = versions.find((v) => v.effectiveFrom <= today && (!v.effectiveUntil || v.effectiveUntil >= today))
    if (active) currentSlots.push(active)
  }

  const studentById = Object.fromEntries(students.map((s) => [s.id, s]))
  return { currentSlots, studentById }
}

function nextSmartStartTime(daySlots) {
  if (daySlots.length === 0) return '08:00'
  const last = [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime)).at(-1)
  const [h, m] = last.startTime.split(':').map(Number)
  const total = h * 60 + m + last.durationMinutes + 5
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function SchedulePage() {
  const data = useLiveQuery(loadScheduleData, [])
  const [selectedDay, setSelectedDay] = useState(1) // Δευτέρα — προεπιλογή σε tablet/mobile
  const [viewMode, setViewMode] = useState('list') // 'list' | 'grid' — πάντα «Λίστα» στην εκκίνηση
  const [formState, setFormState] = useState(null) // { mode, slot?, initialDayOfWeek?, defaultStartTime? }
  const [copyFromDay, setCopyFromDay] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  if (!data) {
    return (
      <AppShell>
        <p>Φόρτωση…</p>
      </AppShell>
    )
  }

  const { currentSlots, studentById } = data

  function slotsForDay(dayOfWeek) {
    return currentSlots.filter((s) => s.dayOfWeek === dayOfWeek).sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  function namesFor(slot) {
    return slot.studentIds.map((id) => studentById[id]?.code).filter(Boolean).join(', ')
  }

  async function handleTogglePause(slot) {
    await pauseScheduleSlot(slot.id, !slot.active)
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    await endScheduleSlotSeries(deleteTarget.id, 'today')
    setDeleteTarget(null)
  }

  return (
    <AppShell>
      <PageHeader
        title="Πρόγραμμα"
        subtitle="Το σταθερό εβδομαδιαίο πρόγραμμά σου — τροφοδοτεί αυτόματα τη «Η μέρα μου»."
        secondaryActions={[{ label: 'Μηνιαίο ημερολόγιο', icon: CalendarDays, to: '/schedule/calendar' }]}
      />

      <div className="schedule-page__view-tabs">
        <Tabs tabs={VIEW_MODE_TABS} activeId={viewMode} onChange={setViewMode} />
      </div>

      <div className="schedule-page__day-tabs">
        <Tabs
          tabs={WEEKDAYS_MON_FRI.map((d) => ({ id: String(d.value), label: d.short }))}
          activeId={String(selectedDay)}
          onChange={(id) => setSelectedDay(Number(id))}
        />
      </div>

      {viewMode === 'list' && (
        <div className="schedule-page__days">
          {WEEKDAYS_MON_FRI.map((day) => {
            const daySlots = slotsForDay(day.value)
            return (
              <div
                key={day.value}
                className={`schedule-page__day ${day.value !== selectedDay ? 'schedule-page__day--inactive' : ''}`}
              >
                <div className="schedule-page__day-header">
                  <h2 className="schedule-page__day-title">{day.label}</h2>
                  <div className="schedule-page__day-actions">
                    {daySlots.length > 0 && (
                      <Button variant="ghost" icon={Copy} onClick={() => setCopyFromDay(day.value)} ariaLabel={`Αντιγραφή προγράμματος ${day.label}`}>
                        Αντιγραφή
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      icon={Plus}
                      onClick={() =>
                        setFormState({ mode: 'create', initialDayOfWeek: day.value, defaultStartTime: nextSmartStartTime(daySlots) })
                      }
                    >
                      Πρόσθεσε
                    </Button>
                  </div>
                </div>

                {daySlots.length === 0 ? (
                  <p className="schedule-page__day-empty">Κανένα σταθερό ραντεβού ακόμα.</p>
                ) : (
                  <div className="schedule-page__day-list">
                    {daySlots.map((slot) => (
                      <ScheduleSlotRow
                        key={slot.id}
                        slot={slot}
                        namesLabel={namesFor(slot)}
                        onEdit={() => setFormState({ mode: 'edit', slot })}
                        onTogglePause={() => handleTogglePause(slot)}
                        onDelete={() => setDeleteTarget(slot)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {viewMode === 'grid' && (
        <WeeklyScheduleGrid
          slots={currentSlots}
          studentById={studentById}
          selectedDay={selectedDay}
          onEditSlot={(slot) => setFormState({ mode: 'edit', slot })}
        />
      )}

      {formState && (
        <ScheduleSlotForm
          mode={formState.mode}
          slot={formState.slot}
          initialDayOfWeek={formState.initialDayOfWeek}
          defaultStartTime={formState.defaultStartTime}
          onClose={() => setFormState(null)}
          onSaved={() => {}}
        />
      )}

      {copyFromDay != null && (
        <CopyDayModal fromDay={copyFromDay} onClose={() => setCopyFromDay(null)} />
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Διαγραφή σταθερής συνεδρίας"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Ακύρωση</Button>
            <Button variant="danger" onClick={handleConfirmDelete}>Διαγραφή από σήμερα</Button>
          </>
        }
      >
        <p>Η {deleteTarget ? weekdayLabel(deleteTarget.dayOfWeek) : ''} συνεδρία {deleteTarget ? namesFor(deleteTarget) : ''} θα σταματήσει να επαναλαμβάνεται από σήμερα. Το ιστορικό των συνεδριών που έγιναν παραμένει.</p>
      </Modal>
    </AppShell>
  )
}

function CopyDayModal({ fromDay, onClose }) {
  const [targetDays, setTargetDays] = useState([])
  const [mode, setMode] = useState('append')
  const [saving, setSaving] = useState(false)

  function toggleDay(value) {
    setTargetDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]))
  }

  async function handleCopy() {
    setSaving(true)
    try {
      for (const toDay of targetDays) {
        await copyScheduleDay(fromDay, toDay, mode)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Αντιγραφή προγράμματος — ${weekdayLabel(fromDay)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Ακύρωση</Button>
          <Button variant="primary" loading={saving} disabled={targetDays.length === 0} onClick={handleCopy}>
            Αντιγραφή
          </Button>
        </>
      }
    >
      <p className="schedule-page__copy-hint">Σε ποιες μέρες;</p>
      <div className="schedule-page__copy-days">
        {WEEKDAYS_MON_FRI.filter((d) => d.value !== fromDay).map((d) => (
          <button
            key={d.value}
            type="button"
            className={`schedule-slot-form__day-chip ${targetDays.includes(d.value) ? 'schedule-slot-form__day-chip--selected' : ''}`}
            onClick={() => toggleDay(d.value)}
            aria-pressed={targetDays.includes(d.value)}
          >
            {d.short}
          </button>
        ))}
      </div>
      <label className="schedule-slot-form__radio">
        <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} />
        Προσθήκη δίπλα σε ό,τι ήδη υπάρχει
      </label>
      <label className="schedule-slot-form__radio">
        <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
        Αντικατάσταση ό,τι ήδη υπάρχει
      </label>
    </Modal>
  )
}
