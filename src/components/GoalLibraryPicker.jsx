import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Trash2 } from 'lucide-react'
import { listGoalTemplates, updateGoalTemplate, deleteGoalTemplate } from '../db.js'
import { prefillFromSource } from '../utils/goalTemplates.js'
import { diffFields } from '../utils/formDiff.js'
import { DOMAINS, domainName } from '../config/domains.js'
import { listMeasurementTypes } from '../utils/measurementTypes/index.js'
import Modal from './ui/Modal.jsx'
import Button from './ui/Button.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import Select from './ui/Select.jsx'
import Textarea from './ui/Textarea.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import './GoalLibraryPicker.css'

// Contextual picker της προσωπικής βιβλιοθήκης — ΑΠΟΚΛΕΙΣΤΙΚΑ από το Βήμα 1 του Goal Wizard, ΚΑΝΕΝΑ
// νέο top-level route (Technical Plan Στάδιο 7, σημείο 2). ΜΙΑ μόνο ενότητα «Η βιβλιοθήκη μου»
// αυτή τη φάση — τα «Έτοιμα πρότυπα» (system, από domainTemplates) μένουν ρητά εκτός πεδίου εδώ
// (καμία σύνθεση/αλλαγή schema στο domainTemplates σε αυτό το Sprint) — βλ. §16 Product Design.
// Η επικεφαλίδα «Η βιβλιοθήκη μου» παραμένει ξεχωριστό section ΤΩΡΑ, ώστε η μελλοντική προσθήκη
// «Έτοιμα πρότυπα» να μην απαιτήσει redesign, μόνο ένα ακόμα section δίπλα.
//
// ΕΝΑ μόνο Modal instance με εσωτερικό view-state (list/confirmReplace/edit/confirmDelete) αντί
// για stacked/nested Modal instances — το Modal.jsx δεν έχει z-index-aware στοίβαξη ή σκοπευμένο
// Escape-handling για πολλαπλά ταυτόχρονα ανοιχτά instances, άρα δύο ξεχωριστά <Modal open> θα
// έδειχναν διπλό backdrop και θα μοιράζονταν απρόβλεπτα το Escape. Μία μόνο εστία εστίασης πάντα.
export default function GoalLibraryPicker({ open, onClose, onApply, isDirty }) {
  const [view, setView] = useState('list') // 'list' | 'confirmReplace' | 'edit' | 'confirmDelete'
  const [selected, setSelected] = useState(null) // το template που αφορά confirmReplace/edit/confirmDelete
  const [editFields, setEditFields] = useState(null)
  const [editError, setEditError] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const templates = useLiveQuery(() => (open ? listGoalTemplates() : undefined), [open])

  // Καθαρό state κάθε φορά που ανοίγει — ίδιο idiom με StudentForm.jsx (reset σε κάθε αλλαγή mode/id).
  useEffect(() => {
    if (open) {
      setView('list')
      setSelected(null)
      setEditError(null)
      setDeleteError(null)
    }
  }, [open])

  function handleSelectTemplate(template) {
    if (isDirty) {
      setSelected(template)
      setView('confirmReplace')
    } else {
      onApply(prefillFromSource(template))
    }
  }

  function confirmReplace() {
    onApply(prefillFromSource(selected))
  }

  function openEdit(template) {
    setSelected(template)
    setEditFields({ domain: template.domain, title: template.title, description: template.description, criterion: template.criterion, measurementType: template.measurementType })
    setEditError(null)
    setView('edit')
  }

  async function handleSaveEdit() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setEditError(null)
    try {
      // Partial-update fix (Root Cause Investigation, Scenario E) — diffFields αντί για ολόκληρο
      // editFields· `selected` παραμένει το αμετάβλητο στιγμιότυπο όπως φορτώθηκε στο openEdit().
      const changes = diffFields(
        { domain: selected.domain, title: selected.title, description: selected.description, criterion: selected.criterion, measurementType: selected.measurementType },
        editFields
      )
      if (Object.keys(changes).length > 0) {
        await updateGoalTemplate(selected.id, changes)
      }
      setView('list')
      setSelected(null)
    } catch (err) {
      setEditError(err?.message || 'Η ενημέρωση απέτυχε. Δοκίμασε ξανά.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function openDeleteConfirm(template) {
    setSelected(template)
    setDeleteError(null)
    setView('confirmDelete')
  }

  async function handleConfirmDelete() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setDeleteError(null)
    try {
      await deleteGoalTemplate(selected.id)
      setView('list')
      setSelected(null)
    } catch (err) {
      setDeleteError(err?.message || 'Η διαγραφή απέτυχε. Δοκίμασε ξανά.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  // Κλείσιμο μόνο εκτός busy — «κλείσιμο modal μόνο μετά από επιτυχημένη ενέργεια» (σημείο 8).
  function handleClose() {
    if (busy) return
    onClose()
  }

  function backToList() {
    setView('list')
    setSelected(null)
    setEditError(null)
    setDeleteError(null)
  }

  const titles = {
    list: 'Βιβλιοθήκη στόχων',
    confirmReplace: 'Αντικατάσταση δεδομένων;',
    edit: `Επεξεργασία «${selected?.title || ''}»`,
    confirmDelete: `Οριστική διαγραφή «${selected?.title || ''}»`
  }

  const footers = {
    list: null,
    confirmReplace: (
      <>
        <Button variant="ghost" onClick={backToList}>Ακύρωση</Button>
        <Button variant="primary" onClick={confirmReplace}>Αντικατάσταση</Button>
      </>
    ),
    edit: (
      <>
        <Button variant="ghost" onClick={backToList} disabled={busy}>Ακύρωση</Button>
        <Button variant="primary" loading={busy} onClick={handleSaveEdit}>Αποθήκευση</Button>
      </>
    ),
    confirmDelete: (
      <>
        <Button variant="ghost" onClick={backToList} disabled={busy}>Ακύρωση</Button>
        <Button variant="danger" loading={busy} onClick={handleConfirmDelete}>Διαγραφή οριστικά</Button>
      </>
    )
  }

  return (
    <Modal open={open} onClose={handleClose} title={titles[view]} footer={footers[view]}>
      {view === 'list' && (
        <>
          <h3 className="goal-library-picker__section-title">Η βιβλιοθήκη μου</h3>
          {!templates ? (
            <p>Φόρτωση…</p>
          ) : templates.length === 0 ? (
            <p className="goal-library-picker__empty">
              Δεν έχεις αποθηκευμένα πρότυπα ακόμα — άνοιξε έναν στόχο και επίλεξε «Αποθήκευσε ως πρότυπο».
            </p>
          ) : (
            <ul className="goal-library-picker__list">
              {templates.map((t) => (
                <li key={t.id} className="goal-library-picker__item">
                  <button type="button" className="goal-library-picker__select" onClick={() => handleSelectTemplate(t)}>
                    <span className="goal-library-picker__item-title">{t.title}</span>
                    <span className="goal-library-picker__item-domain">{domainName(t.domain)}</span>
                  </button>
                  <OverflowMenu
                    ariaLabel={`Ενέργειες για το πρότυπο ${t.title}`}
                    items={[
                      { label: 'Επεξεργασία', icon: Pencil, onClick: () => openEdit(t) },
                      { label: 'Διαγραφή', icon: Trash2, variant: 'danger', onClick: () => openDeleteConfirm(t) }
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view === 'confirmReplace' && (
        <p>Έχεις ήδη συμπληρώσει στοιχεία σε αυτόν τον στόχο. Η επιλογή του προτύπου «{selected?.title}» θα τα αντικαταστήσει. Συνέχεια;</p>
      )}

      {view === 'edit' && editFields && (
        <>
          <FormField htmlFor="templateEditDomain" label="Τομέας" required>
            <Select
              id="templateEditDomain"
              autoFocus
              value={editFields.domain}
              onChange={(e) => setEditFields((prev) => ({ ...prev, domain: e.target.value }))}
              disabled={busy}
            >
              {DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </FormField>
          <FormField htmlFor="templateEditTitle" label="Τίτλος" required>
            <Input
              id="templateEditTitle"
              type="text"
              value={editFields.title}
              onChange={(e) => setEditFields((prev) => ({ ...prev, title: e.target.value }))}
              disabled={busy}
            />
          </FormField>
          <FormField htmlFor="templateEditDescription" label="Περιγραφή">
            <Textarea
              id="templateEditDescription"
              value={editFields.description}
              onChange={(e) => setEditFields((prev) => ({ ...prev, description: e.target.value }))}
              disabled={busy}
            />
          </FormField>
          <FormField htmlFor="templateEditCriterion" label="Κριτήριο">
            <Input
              id="templateEditCriterion"
              type="text"
              value={editFields.criterion}
              onChange={(e) => setEditFields((prev) => ({ ...prev, criterion: e.target.value }))}
              disabled={busy}
            />
          </FormField>
          <FormField htmlFor="templateEditMeasurementType" label="Τύπος μέτρησης">
            <Select
              id="templateEditMeasurementType"
              value={editFields.measurementType}
              onChange={(e) => setEditFields((prev) => ({ ...prev, measurementType: e.target.value }))}
              disabled={busy}
            >
              <option value="">— Κανένας —</option>
              {listMeasurementTypes().map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </FormField>
          {editError && <p role="alert" className="goal-library-picker__error">{editError}</p>}
        </>
      )}

      {view === 'confirmDelete' && (
        <>
          <p>Το πρότυπο θα διαγραφεί από τη βιβλιοθήκη σου. Στόχοι που έχουν ήδη δημιουργηθεί από αυτό ΔΕΝ επηρεάζονται — παραμένουν πλήρως ανεξάρτητοι. Δεν αναιρείται.</p>
          {deleteError && <p role="alert" className="goal-library-picker__error">{deleteError}</p>}
        </>
      )}
    </Modal>
  )
}
