import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createScheduleSlot, saveScheduleSlotEdit } from '../db.js'
import { activeTable } from '../migration/activeGeneration.js'
import { DURATION_OPTIONS } from '../config/sessionOptions.js'
import { WEEKDAYS_MON_FRI, WEEKDAYS } from '../config/scheduleOptions.js'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import DateField from './ui/DateField.jsx'
import DurationChips from './ui/DurationChips.jsx'
import SelectableStudentRow from './SelectableStudentRow.jsx'
import './ScheduleSlotForm.css'

// Δημιουργία/επεξεργασία ΕΝΟΣ σταθερού slot (Sprint 6). Δύο λειτουργίες σε ένα component
// (ίδιο πνεύμα με το SessionModal view/edit, εδώ create/edit) γιατί μοιράζονται όλη τη φόρμα —
// η μόνη πραγματική διαφορά είναι: στη δημιουργία επιλέγεις ΠΟΛΛΕΣ μέρες μαζί (Product Design
// §8 — «Μ2, 9:00, 30′, Δε/Τε/Πα» σε ένα βήμα) και το modal ΜΕΝΕΙ ανοιχτό μετά την αποθήκευση
// («λειτουργία προσθήκης» — καθαρίζει και προτείνει την επόμενη ώρα)· στην επεξεργασία η μέρα
// είναι σταθερή (ανήκει ήδη σε ΜΙΑ σειρά) και εμφανίζεται η ερώτηση «Από πότε ισχύει;».
export default function ScheduleSlotForm({ mode, slot, initialDayOfWeek, defaultStartTime, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const activeStudents = useLiveQuery(() => activeTable('students').orderBy('code').toArray(), [])
  const allStudents = activeStudents?.filter((s) => s.active)

  const [selectedStudentIds, setSelectedStudentIds] = useState(() => (isEdit ? slot.studentIds : []))
  const [selectedDays, setSelectedDays] = useState(() => (isEdit ? [slot.dayOfWeek] : initialDayOfWeek != null ? [initialDayOfWeek] : []))
  const [startTime, setStartTime] = useState(() => (isEdit ? slot.startTime : defaultStartTime || '09:00'))
  const [duration, setDuration] = useState(() => (isEdit ? slot.durationMinutes : 30))
  const [label, setLabel] = useState(() => (isEdit ? slot.label || '' : ''))
  const [effectiveMode, setEffectiveMode] = useState('today')
  // Σκόπιμα ΚΕΝΟ, όχι προσυμπληρωμένο με σήμερα (bug fix — Sprint 6, δεύτερος γύρος): ένα κενό,
  // υποχρεωτικό πεδίο αναγκάζει ρητή επιλογή· πριν, το προσυμπληρωμένο "σήμερα" σήμαινε ότι μια
  // ξεχασμένη αλλαγή ημερομηνίας κατέληγε σιωπηλά να ισχύει "από σήμερα" παρόλο που επιλέχθηκε
  // «συγκεκριμένη ημερομηνία».
  const [effectiveDate, setEffectiveDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  // Επαναφορά προσωρινού μηνύματος «Προστέθηκε» (βλ. footer) — καθαρά UX ένδειξη, δεν αγγίζει state φόρμας.
  useEffect(() => {
    if (!justSaved) return
    const t = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(t)
  }, [justSaved])

  function toggleStudent(id) {
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleDay(value) {
    setSelectedDays((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]))
  }

  const effectiveDateMissing = isEdit && effectiveMode === 'date' && !effectiveDate
  const isValid = selectedStudentIds.length > 0 && selectedDays.length > 0 && startTime && duration && !effectiveDateMissing

  function resetForNextAdd(lastStartTime) {
    // «Λειτουργία προσθήκης» (Product Design §8): καθαρίζει μαθητή/ετικέτα, ΚΡΑΤΑΕΙ τις ίδιες
    // επιλεγμένες μέρες (συνεχίζει στο ίδιο πλαίσιο εργασίας), προτείνει την επόμενη ώρα.
    setSelectedStudentIds([])
    setLabel('')
    const [h, m] = lastStartTime.split(':').map(Number)
    const totalMinutes = h * 60 + m + duration + 5
    const nextH = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')
    const nextM = String(totalMinutes % 60).padStart(2, '0')
    setStartTime(`${nextH}:${nextM}`)
  }

  async function handleCreate() {
    setSaving(true)
    try {
      for (const dayOfWeek of selectedDays) {
        await createScheduleSlot({
          dayOfWeek,
          startTime,
          durationMinutes: duration,
          type: selectedStudentIds.length > 1 ? 'group' : 'individual',
          studentIds: selectedStudentIds,
          label
        })
      }
      onSaved?.()
      setJustSaved(true)
      resetForNextAdd(startTime)
    } finally {
      setSaving(false)
    }
  }

  async function handleEditSave() {
    setSaving(true)
    try {
      await saveScheduleSlotEdit(
        slot.id,
        {
          startTime,
          durationMinutes: duration,
          type: selectedStudentIds.length > 1 ? 'group' : 'individual',
          studentIds: selectedStudentIds,
          label
        },
        effectiveMode,
        effectiveDate
      )
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!allStudents) {
    return (
      <Modal open onClose={onClose} title="Φόρτωση…">
        <p>Φόρτωση…</p>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Επεξεργασία σταθερής συνεδρίας' : 'Νέα σταθερή συνεδρία'}
      footer={
        isEdit ? (
          <>
            <Button variant="ghost" onClick={onClose}>Ακύρωση</Button>
            <Button variant="primary" loading={saving} disabled={!isValid} onClick={handleEditSave}>Αποθήκευση</Button>
          </>
        ) : (
          <>
            {justSaved && <span className="schedule-slot-form__saved-hint">✓ Προστέθηκε</span>}
            <Button variant="ghost" onClick={onClose}>Έτοιμος</Button>
            <Button variant="primary" loading={saving} disabled={!isValid} onClick={handleCreate}>Προσθήκη</Button>
          </>
        )
      }
    >
      <FormField label="Μέρες">
        <div className="schedule-slot-form__days">
          {WEEKDAYS_MON_FRI.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`schedule-slot-form__day-chip ${selectedDays.includes(d.value) ? 'schedule-slot-form__day-chip--selected' : ''}`}
              onClick={() => toggleDay(d.value)}
              disabled={isEdit}
              aria-pressed={selectedDays.includes(d.value)}
            >
              {d.short}
            </button>
          ))}
        </div>
        {!isEdit && (
          <p className="schedule-slot-form__hint">Επίλεξε περισσότερες από μία αν ο μαθητής έρχεται την ίδια ώρα πολλές μέρες.</p>
        )}
      </FormField>

      <FormField htmlFor="scheduleSlotStartTime" label="Ώρα έναρξης">
        <Input
          id="scheduleSlotStartTime"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
      </FormField>

      <FormField label="Διάρκεια">
        <DurationChips options={DURATION_OPTIONS} value={duration} onChange={setDuration} />
      </FormField>

      <FormField label="Μαθητής/ές">
        <div className="schedule-slot-form__students">
          {allStudents.map((s) => (
            <SelectableStudentRow
              key={s.id}
              code={s.code}
              nickname={s.nickname}
              selected={selectedStudentIds.includes(s.id)}
              onSelect={() => toggleStudent(s.id)}
              mode="multiple"
              name="schedule-slot-students"
            />
          ))}
        </div>
      </FormField>

      <FormField htmlFor="scheduleSlotLabel" label="Ετικέτα (προαιρετικό)">
        <Input id="scheduleSlotLabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="π.χ. Λογοθεραπεία" />
      </FormField>

      {isEdit && (
        <FormField label="Από πότε ισχύει η αλλαγή;">
          <div className="schedule-slot-form__effective">
            <label className="schedule-slot-form__radio">
              <input type="radio" checked={effectiveMode === 'today'} onChange={() => setEffectiveMode('today')} />
              Από σήμερα
            </label>
            <label className="schedule-slot-form__radio">
              <input type="radio" checked={effectiveMode === 'date'} onChange={() => setEffectiveMode('date')} />
              Από συγκεκριμένη ημερομηνία
            </label>
          </div>
          {effectiveMode === 'date' && (
            <>
              <DateField id="scheduleSlotEffectiveDate" value={effectiveDate} onChange={setEffectiveDate} />
              {effectiveDateMissing && (
                <p className="schedule-slot-form__effective-error" role="alert">
                  Επίλεξε την ημερομηνία από την οποία θα ισχύσει η αλλαγή.
                </p>
              )}
            </>
          )}
        </FormField>
      )}
    </Modal>
  )
}

export { WEEKDAYS }
