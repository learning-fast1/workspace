import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDisplayName, setDisplayName, getSchoolName, setSchoolName, getSpecialty, setSpecialty } from '../db.js'
import useAuth from '../auth/useAuth.js'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import Button from './ui/Button.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import './TeacherProfileSection.css'

const EMPTY_DRAFT = { displayName: '', schoolName: '', specialty: '' }

// Teacher Profile + Settings (UI Design v3, εγκεκριμένο) — διάδοχος του παλιότερου
// DisplayNameSection.jsx, πλέον πραγματικό «Προφίλ εκπαιδευτικού» με 4 πεδία σε δύο ομάδες
// (Ταυτότητα / Επαγγελματικά στοιχεία). Το draft σπέρνεται ΜΙΑ φορά (ίδιο idiom με πριν) από τις
// 3 ζωντανές τιμές — ΟΧΙ συνεχές resync, ώστε μια μόλις επιτυχής αποθήκευση να μην «τρεμοπαίξει».
//
// Save button: disabled μέχρι πραγματική αλλαγή (review χρήστη) — ΙΔΙΟΣ υπολογισμός
// (JSON.stringify comparison) με το ήδη υπάρχον isDirty() idiom του StudentForm.jsx/
// GoalWizardForm.jsx/YearTransitionWizard.jsx, εδώ εφαρμοσμένος στο ίδιο το κουμπί (disabled prop,
// ήδη υποστηριζόμενο από το Button, ήδη έτσι χρησιμοποιημένο στο EnableSyncSection) αντί για ένα
// νέο «εμφανίσου/κρύψου» μοτίβο χωρίς προηγούμενο στο Workspace.
export default function TeacherProfileSection() {
  const savedName = useLiveQuery(getDisplayName, [])
  const savedSchool = useLiveQuery(getSchoolName, [])
  const savedSpecialty = useLiveQuery(getSpecialty, [])
  const { status, email } = useAuth()

  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)
  const seededRef = useRef(false)
  const savedSnapshotRef = useRef(EMPTY_DRAFT)

  const allLoaded = savedName !== undefined && savedSchool !== undefined && savedSpecialty !== undefined

  useEffect(() => {
    if (!seededRef.current && allLoaded) {
      seededRef.current = true
      const snapshot = { displayName: savedName || '', schoolName: savedSchool || '', specialty: savedSpecialty || '' }
      setDraft(snapshot)
      savedSnapshotRef.current = snapshot
    }
  }, [allLoaded, savedName, savedSchool, savedSpecialty])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedSnapshotRef.current)

  function updateDraft(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isDirty) return
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const trimmed = {
        displayName: draft.displayName.trim(),
        schoolName: draft.schoolName.trim(),
        specialty: draft.specialty.trim()
      }
      await Promise.all([
        setDisplayName(trimmed.displayName),
        setSchoolName(trimmed.schoolName),
        setSpecialty(trimmed.specialty)
      ])
      savedSnapshotRef.current = trimmed
      setDraft(trimmed)
      setSaved(true)
    } catch (err) {
      setSaveError(err?.message || 'Η αποθήκευση απέτυχε. Δοκίμασε ξανά.')
    } finally {
      setSaving(false)
    }
  }

  const previewGreeting = draft.displayName.trim() ? `Καλημέρα, ${draft.displayName.trim()}` : 'Καλημέρα'

  return (
    <div className="section teacher-profile-section">
      <h2>Προφίλ εκπαιδευτικού</h2>
      <p className="hint">
        Το προφίλ σου καθορίζει πώς εμφανίζεσαι μέσα στο Workspace — στον χαιρετισμό της Αρχικής,
        στο μενού χρήστη, και μελλοντικά όπου χρειαστεί ταυτότητα εκπαιδευτικού.
      </p>
      <form onSubmit={handleSubmit} className="teacher-profile-section__form" noValidate>
        <div className="teacher-profile-section__group">
          <h3>Ταυτότητα</h3>
          <FormField htmlFor="teacher-profile-name" label="Όνομα εμφάνισης">
            <Input
              id="teacher-profile-name"
              type="text"
              value={draft.displayName}
              onChange={(e) => updateDraft('displayName', e.target.value)}
              placeholder="π.χ. Όλγα"
              maxLength={60}
            />
          </FormField>
          <p className="teacher-profile-section__helper">Εμφανίζεται στον χαιρετισμό της Αρχικής και στο μενού χρήστη πάνω δεξιά.</p>
          <p className="teacher-profile-section__preview">Έτσι θα σε βλέπεις στην Αρχική: «{previewGreeting}»</p>

          {status === 'loggedIn' && email && (
            <div className="teacher-profile-section__field">
              <FormField htmlFor="teacher-profile-email" label="Email">
                <div id="teacher-profile-email" className="teacher-profile-section__readonly">{email}</div>
              </FormField>
              <p className="teacher-profile-section__helper">Μόνο για εμφάνιση — διαχειρίζεται από την ενότητα «Λογαριασμός &amp; Sync», δεν αποθηκεύεται ξανά εδώ.</p>
            </div>
          )}
        </div>

        <div className="teacher-profile-section__group">
          <h3>Επαγγελματικά στοιχεία — προαιρετικά</h3>
          <p className="teacher-profile-section__helper">Προαιρετικά στοιχεία που εξατομικεύουν το προφίλ σου και μπορούν να αξιοποιηθούν από λειτουργίες της εφαρμογής όποτε χρειαστεί.</p>
          <FormField htmlFor="teacher-profile-school" label="Σχολείο">
            <Input
              id="teacher-profile-school"
              type="text"
              value={draft.schoolName}
              onChange={(e) => updateDraft('schoolName', e.target.value)}
              placeholder="π.χ. 3ο Δημοτικό Λευκωσίας"
              maxLength={100}
            />
          </FormField>
          <FormField htmlFor="teacher-profile-specialty" label="Ειδικότητα">
            <Input
              id="teacher-profile-specialty"
              type="text"
              value={draft.specialty}
              onChange={(e) => updateDraft('specialty', e.target.value)}
              placeholder="π.χ. Λογοθεραπεύτρια"
              maxLength={100}
            />
          </FormField>
        </div>

        {saveError && <AlertBanner variant="danger">{saveError}</AlertBanner>}
        {saved && <AlertBanner variant="success">Αποθηκεύτηκε.</AlertBanner>}
        <div className="actions-row">
          <Button type="submit" variant="primary" loading={saving} disabled={!isDirty}>Αποθήκευση</Button>
        </div>
      </form>
    </div>
  )
}
