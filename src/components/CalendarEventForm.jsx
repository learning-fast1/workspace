import { useState } from 'react'
import { bulkCancelDay } from '../db.js'
import { activeTable, withNewRowId } from '../migration/activeGeneration.js'
import { resolveOccurrencesForDate } from '../utils/scheduleResolution.js'
import { sameStudentSet } from '../utils/dailyQueue.js'
import { CALENDAR_EVENT_CATEGORIES, BULK_CANCEL_CATEGORIES } from '../config/scheduleOptions.js'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import Select from './ui/Select.jsx'
import Textarea from './ui/Textarea.jsx'
import './CalendarEventForm.css'

// Δημιουργία/επεξεργασία γεγονότος ημερολογίου (Sprint 6) — ελεύθερος τίτλος, ΠΡΟΑΙΡΕΤΙΚΗ
// κατηγορία (Product Design, αναθεωρημένος γύρος: ώστε να χρησιμεύει και για προσωπικές
// υπενθυμίσεις, όχι μόνο σχολικά γεγονότα). Καθαρά πληροφοριακό — καμία foreign key προς
// schedule/sessions (Technical Plan §7). Η μόνη σύνδεση: μετά την αποθήκευση ενός γεγονότος
// κατηγορίας Αργία/Σχολική εκδήλωση, προσφέρεται μία εφάπαξ πρόταση μαζικής ακύρωσης — bulk
// εφαρμογή του ΙΔΙΟΥ μηχανισμού ακύρωσης-ανά-εμφάνιση, όχι ξεχωριστός κανόνας «ημέρα κλειστή».
export default function CalendarEventForm({ date, event, onClose, onSaved }) {
  const isEdit = !!event
  const [title, setTitle] = useState(event?.title || '')
  const [category, setCategory] = useState(event?.category || '')
  const [startTime, setStartTime] = useState(event?.startTime || '')
  const [note, setNote] = useState(event?.note || '')
  const [saving, setSaving] = useState(false)
  const [savedEventId, setSavedEventId] = useState(null)
  const [cancellableCount, setCancellableCount] = useState(0)
  const [bulkCancelling, setBulkCancelling] = useState(false)
  const [bulkCancelDone, setBulkCancelDone] = useState(null)

  const showBulkOffer = savedEventId !== null

  // Πόσες προγραμματισμένες εμφανίσεις θα επηρέαζε πράγματι μια μαζική ακύρωση σε αυτή την
  // ημερομηνία — ΙΔΙΑ επίλυση με το bulkCancelDay (utils/scheduleResolution.js), εξαιρουμένων
  // όσων έχουν ήδη πραγματική (μη-notHeld) συνεδρία, αφού εκείνες δεν θα αγγίζονταν ούτως ή
  // άλλως. Το prompt εμφανίζεται ΜΟΝΟ αν αυτός ο αριθμός είναι πάνω από μηδέν.
  async function countCancellableOccurrences() {
    const [scheduleSlots, scheduleExceptions, sessionsOnDate] = await Promise.all([
      activeTable('scheduleSlots').toArray(),
      activeTable('scheduleExceptions').toArray(),
      activeTable('sessions').where('date').equals(date).toArray()
    ])
    const occurrences = resolveOccurrencesForDate(date, { scheduleSlots, scheduleExceptions })
    return occurrences.filter(
      (o) => !sessionsOnDate.some((s) => s.status !== 'notHeld' && sameStudentSet(s.studentIds, o.studentIds))
    ).length
  }

  async function handleSave() {
    const trimmed = title.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const fields = { date, title: trimmed, category: category || null, startTime: startTime || null, note }
      if (isEdit) {
        await activeTable('calendarEvents').update(event.id, fields)
        onSaved?.()
        onClose()
      } else {
        const id = await activeTable('calendarEvents').add(withNewRowId(fields))
        onSaved?.()
        if (BULK_CANCEL_CATEGORIES.includes(category)) {
          const count = await countCancellableOccurrences()
          if (count > 0) {
            setCancellableCount(count)
            setSavedEventId(id)
            return
          }
        }
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleBulkCancel() {
    setBulkCancelling(true)
    try {
      const count = await bulkCancelDay(date, title.trim())
      setBulkCancelDone(count)
    } finally {
      setBulkCancelling(false)
    }
  }

  async function handleDelete() {
    if (!event) return
    await activeTable('calendarEvents').delete(event.id)
    onSaved?.()
    onClose()
  }

  if (showBulkOffer) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Ακύρωση προγραμματισμένων συνεδριών;"
        footer={
          bulkCancelDone !== null ? (
            <Button variant="primary" onClick={onClose}>Έτοιμο</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Όχι</Button>
              <Button variant="danger" loading={bulkCancelling} onClick={handleBulkCancel}>Ναι, ακύρωσέ τες</Button>
            </>
          )
        }
      >
        {bulkCancelDone !== null ? (
          <p>Ακυρώθηκαν {bulkCancelDone} προγραμματισμένες συνεδρίες για αυτή τη μέρα.</p>
        ) : cancellableCount === 1 ? (
          <p>Υπάρχει 1 προγραμματισμένη συνεδρία αυτή την ημέρα. Θέλεις να την ακυρώσεις;</p>
        ) : (
          <p>Υπάρχουν {cancellableCount} προγραμματισμένες συνεδρίες αυτή την ημέρα. Θέλεις να τις ακυρώσεις;</p>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Επεξεργασία γεγονότος' : 'Νέο γεγονός'}
      footer={
        <>
          {isEdit && <Button variant="danger" onClick={handleDelete}>Διαγραφή</Button>}
          <Button variant="ghost" onClick={onClose}>Ακύρωση</Button>
          <Button variant="primary" loading={saving} disabled={!title.trim()} onClick={handleSave}>Αποθήκευση</Button>
        </>
      }
    >
      <FormField htmlFor="calendarEventTitle" label="Τίτλος" required>
        <Input id="calendarEventTitle" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="π.χ. Σχολική γιορτή" />
      </FormField>

      <FormField htmlFor="calendarEventCategory" label="Κατηγορία (προαιρετικό)">
        <Select id="calendarEventCategory" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Χωρίς κατηγορία</option>
          {CALENDAR_EVENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </FormField>

      <FormField htmlFor="calendarEventTime" label="Ώρα (προαιρετικό)">
        <Input id="calendarEventTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </FormField>

      <FormField htmlFor="calendarEventNote" label="Σημείωση (προαιρετικό)">
        <Textarea id="calendarEventNote" value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
    </Modal>
  )
}
