import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, UserX } from 'lucide-react'
import { activeTable, resolveEntityId, withNewRowId } from '../migration/activeGeneration.js'
import { diffFields } from '../utils/formDiff.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import Card from './ui/Card.jsx'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import EmptyState from './ui/EmptyState.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import Textarea from './ui/Textarea.jsx'
import './StudentForm.css'

// ΑΜΕΤΑΒΛΗΤΟ data model — μόνο τα βασικά στοιχεία ταυτότητας φαίνονται σε αυτή τη φόρμα.
// functionalProfile/preferences/active δεν επεξεργάζονται εδώ (βλ. καρτέλες Προφίλ/Ενισχυτές
// στο StudentProfile, και το overflow menu στο StudentCard για active) — μεταφέρονται ΑΝΕΠΑΦΑ.
const emptyStudent = {
  code: '',
  nickname: '',
  grade: '',
  notes: '',
  functionalProfile: [],
  preferences: {},
  active: true
}

export default function StudentForm({ mode }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyStudent)
  const [loading, setLoading] = useState(mode === 'edit')
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [codeError, setCodeError] = useState(null)
  const [saveError, setSaveError] = useState(false)
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  // Ref εκτός από state: το setState δεν εφαρμόζεται συγχρονισμένα, οπότε δύο κλικ στο ίδιο tick
  // (γρήγορο διπλό tap στο «Αποθήκευση») θα διάβαζαν και τα δύο το παλιό saving=false.
  const savingRef = useRef(false)
  // Στιγμιότυπο της φόρμας όπως φορτώθηκε αρχικά — μοναδική πηγή αλήθειας για το πραγματικό
  // dirty state (σύγκριση με το τρέχον form, όχι απλό «κάτι γράφτηκε»).
  const initialFormRef = useRef(mode === 'create' ? emptyStudent : null)
  const codeInputRef = useRef(null)

  // Ρητό reset ΟΛΟΥ του state σε κάθε αλλαγή mode/id — όχι μόνο "load όταν edit". Ο React Router
  // ΔΕΝ ξαναφτιάχνει πάντα το component instance όταν αλλάζει route μεταξύ /students/new και
  // /students/:id/edit (ίδιο component σε διαφορετικά Route, ίδια θέση στο δέντρο) — αν το effect
  // περιοριζόταν στο "if mode !== 'edit' return", ένα προηγούμενο notFound=true θα έμενε
  // κολλημένο για πάντα και μια νέα /students/new θα εμφάνιζε ακόμα το παλιό «δεν βρέθηκε».
  useEffect(() => {
    setCodeError(null)
    setSaveError(false)
    setConfirmDiscardOpen(false)

    if (mode === 'edit') {
      setNotFound(false)
      setLoading(true)
      // resolveEntityId: null σημαίνει μη έγκυρο id για την ενεργή γενιά (π.χ. κατεστραμμένο URL,
      // ή ΠΑΛΙΑ ένα v2 UUID/SHA id μετατρεπόταν σιωπηλά σε NaN μέσω Number(id) — βλ. Technical Fix
      // Plan). ΠΟΤΕ κλήση .get() με μη έγκυρο key — απευθείας «δεν βρέθηκε».
      const studentId = resolveEntityId(id)
      if (studentId === null) {
        setNotFound(true)
        setLoading(false)
        return
      }
      activeTable('students').get(studentId).then((student) => {
        if (student) {
          setForm(student)
          initialFormRef.current = student
        } else {
          setNotFound(true)
        }
        setLoading(false)
      })
    } else {
      setNotFound(false)
      setLoading(false)
      setForm(emptyStudent)
      initialFormRef.current = emptyStudent
    }
  }, [mode, id])

  function updateField(field, value) {
    if (field === 'code') setCodeError(null) // το προηγούμενο μήνυμα δεν ισχύει πια για νέο κείμενο
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function isDirty() {
    return JSON.stringify(form) !== JSON.stringify(initialFormRef.current)
  }

  const leaveTo = mode === 'create' ? '/students' : `/students/${id}`

  function requestLeave() {
    if (isDirty()) {
      setConfirmDiscardOpen(true)
    } else {
      navigate(leaveTo)
    }
  }

  function handleDiscardConfirm() {
    setConfirmDiscardOpen(false)
    navigate(leaveTo)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (savingRef.current) return

    const code = form.code.trim()
    if (!code) {
      setCodeError('Ο κωδικός είναι υποχρεωτικός.')
      codeInputRef.current?.focus()
      return
    }

    savingRef.current = true
    setSaving(true)
    setCodeError(null)
    setSaveError(false)
    try {
      const studentsTable = activeTable('students')
      const studentId = resolveEntityId(id) // null σε create mode (κανένα id ακόμα) — ok, βλ. παρακάτω
      const existing = await studentsTable.where('code').equals(code).first()
      if (existing && existing.id !== studentId) {
        setCodeError(`Υπάρχει ήδη μαθητής με κωδικό «${code}».`)
        codeInputRef.current?.focus()
        return
      }
      if (mode === 'create') {
        const newId = await studentsTable.add(withNewRowId({ ...emptyStudent, ...form, code }))
        navigate(`/students/${newId}`)
      } else {
        // studentId εγγυημένα όχι null εδώ — το notFound branch παραπάνω στο render θα είχε ήδη
        // εμποδίσει να φτάσει η φόρμα (άρα και το submit) σε αυτό το σημείο.
        //
        // Partial-update fix (Root Cause Investigation, Scenario E) — ΠΟΤΕ πια { ...form, code }
        // ολόκληρο· diffFields() πάνω στο ΤΕΛΙΚΟ normalized payload (trimmed code και στις δύο
        // πλευρές της σύγκρισης, αλλιώς ένα καθαρά κοσμητικό leading/trailing space θα καταγραφόταν
        // ως ψευδής αλλαγή) ώστε το πραγματικό property-level merge του Dexie Cloud να λειτουργήσει.
        const normalizedInitial = { ...initialFormRef.current, code: initialFormRef.current.code.trim() }
        const normalizedCurrent = { ...form, code }
        const changes = diffFields(normalizedInitial, normalizedCurrent)
        if (Object.keys(changes).length > 0) {
          await studentsTable.update(studentId, changes)
        }
        navigate(`/students/${id}`)
      }
    } catch (err) {
      console.error(err)
      setSaveError(true)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p>Φόρτωση…</p>
      </AppShell>
    )
  }

  if (notFound) {
    return (
      <AppShell>
        <EmptyState
          icon={UserX}
          title="Ο μαθητής δεν βρέθηκε"
          description="Μπορεί να διαγράφηκε ή ο σύνδεσμος να μην είναι πια έγκυρος."
          actionLabel="Επιστροφή στη λίστα μαθητών"
          actionTo="/students"
        />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <PageHeader
        title={mode === 'create' ? 'Νέος μαθητής' : `Επεξεργασία μαθητή — ${initialFormRef.current?.code}`}
        back={{ label: 'Πίσω', onClick: requestLeave, disabled: saving }}
      />

      {saveError && (
        <AlertBanner variant="danger" icon={AlertTriangle} className="student-form-alert">
          Κάτι πήγε στραβά κατά την αποθήκευση. Δοκίμασε ξανά.
        </AlertBanner>
      )}

      <Card className="student-form-card">
        <form onSubmit={handleSubmit} noValidate>
          <FormField
            htmlFor="code"
            label="Κωδικός μαθητή"
            required
            helperText="Χρησιμοποίησε μόνο κωδικό — μην καταχωρείς πλήρη στοιχεία ταυτότητας."
            error={codeError}
          >
            <Input
              ref={codeInputRef}
              id="code"
              type="text"
              value={form.code}
              onChange={(e) => updateField('code', e.target.value)}
              required
              aria-required="true"
              aria-invalid={codeError ? 'true' : undefined}
              aria-describedby={codeError ? 'code-error' : 'code-helper'}
              error={!!codeError}
              autoFocus={mode === 'create'}
            />
          </FormField>

          <div className="student-form__row">
            <FormField htmlFor="nickname" label="Μικρό όνομα">
              <Input
                id="nickname"
                type="text"
                value={form.nickname}
                onChange={(e) => updateField('nickname', e.target.value)}
              />
            </FormField>

            <FormField htmlFor="grade" label="Τάξη">
              <Input
                id="grade"
                type="text"
                value={form.grade}
                onChange={(e) => updateField('grade', e.target.value)}
              />
            </FormField>
          </div>

          <FormField htmlFor="notes" label="Σημειώσεις">
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </FormField>

          <div className="student-form__actions">
            <Button variant="ghost" type="button" onClick={requestLeave} disabled={saving}>
              Ακύρωση
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Αποθήκευση
            </Button>
          </div>
        </form>
      </Card>

      <Modal
        open={confirmDiscardOpen}
        onClose={() => setConfirmDiscardOpen(false)}
        title="Μη αποθηκευμένες αλλαγές"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscardOpen(false)}>Συνέχεια επεξεργασίας</Button>
            <Button variant="danger" onClick={handleDiscardConfirm}>Απόρριψη αλλαγών</Button>
          </>
        }
      >
        <p>Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί σε αυτή τη φόρμα. Αν φύγεις τώρα, θα χαθούν.</p>
      </Modal>
    </AppShell>
  )
}
