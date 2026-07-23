import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { activeTable } from '../migration/activeGeneration.js'
import { prefillFromSource } from '../utils/goalTemplates.js'
import Modal from './ui/Modal.jsx'
import SearchBar from './ui/SearchBar.jsx'
import './CopyGoalToStudentModal.css'

// «Αντιγραφή σε άλλον μαθητή» (GoalCard overflow) — Technical Plan Στάδιο 7, σημείο 5-6. ΔΕΝ
// δημιουργεί τίποτα εδώ· επιλέγει μόνο προορισμό και περνάει την προσυμπλήρωση στο ΝΕΟ Wizard
// μέσω react-router state (νέο idiom σε αυτό το repo — δεν υπήρχε ήδη κάπου αλλού, βλ. Technical
// Plan). Η πραγματική δημιουργία γίνεται ΑΠΟΚΛΕΙΣΤΙΚΑ μέσω createGoal() όταν ο εκπαιδευτικός
// ολοκληρώσει το Wizard κανονικά — ο αρχικός και ο νέος στόχος παραμένουν πλήρως ανεξάρτητοι.
export default function CopyGoalToStudentModal({ goal, currentStudentId, onClose }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const students = useLiveQuery(() => activeTable('students').orderBy('code').toArray(), [])

  // Ίδιο idiom φιλτραρίσματος ενεργών μαθητών με ScheduleSlotForm.jsx/SelectIndividualStudent.jsx
  // κ.λπ. (κανένα shared helper δεν υπάρχει ήδη στο repo γι' αυτό — δεν εισάγω νέο εδώ).
  const activeOthers = useMemo(
    () => (students || []).filter((s) => s.active && s.id !== currentStudentId),
    [students, currentStudentId]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeOthers
    return activeOthers.filter((s) => `${s.code} ${s.nickname || ''} ${s.grade || ''}`.toLowerCase().includes(q))
  }, [activeOthers, search])

  function handleSelect(student) {
    const prefill = prefillFromSource(goal)
    navigate(`/students/${student.id}/goals/new`, { state: { prefill } })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Αντιγραφή στόχου «${goal.title}» σε άλλον μαθητή`}>
      {!students ? (
        <p>Φόρτωση…</p>
      ) : activeOthers.length === 0 ? (
        <p className="copy-goal-modal__empty">Δεν υπάρχει άλλος ενεργός μαθητής στο caseload σου αυτή τη στιγμή.</p>
      ) : (
        <>
          <SearchBar
            value={search}
            onChange={setSearch}
            onClear={() => setSearch('')}
            placeholder="Αναζήτηση μαθητή…"
          />
          {visible.length === 0 ? (
            <p className="copy-goal-modal__empty">Κανένα αποτέλεσμα.</p>
          ) : (
            <ul className="copy-goal-modal__list">
              {visible.map((s) => (
                <li key={s.id}>
                  <button type="button" className="copy-goal-modal__student" onClick={() => handleSelect(s)}>
                    <span className="copy-goal-modal__code">{s.code}</span>
                    {s.nickname && <span className="copy-goal-modal__nickname">{s.nickname}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  )
}
