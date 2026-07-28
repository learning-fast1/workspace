import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDisplayName, setDisplayName } from '../db.js'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import Button from './ui/Button.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import './DisplayNameSection.css'

// Readiness blockers v1 (review χρήστη) — ζει μέσα στο /settings, ΠΡΩΤΗ ενότητα (πάνω από το
// AccountSection): το εμφανιζόμενο όνομα δεν εξαρτάται από το αν ο χρήστης είναι συνδεδεμένος.
// Σκόπιμα V1-MINIMAL (ρητή απόφαση): ΕΝΑ πεδίο, ΚΑΝΕΝΑ πλήρες προφίλ. Το draft (τοπικό useState)
// σπέρνεται ΜΙΑ φορά από το ήδη αποθηκευμένο όνομα (πρώτη φορά που το useLiveQuery προλαβαίνει να
// λύσει από undefined) — ΟΧΙ συνεχές resync σε κάθε αλλαγή του ζωντανού αποτελέσματος, ώστε μια
// δική του, μόλις επιτυχής αποθήκευση να μην «τρεμοπαίξει» πίσω σε παλιά τιμή όσο η live-query
// προλαβαίνει να ενημερωθεί.
export default function DisplayNameSection() {
  const savedName = useLiveQuery(getDisplayName, [])
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)
  const seededRef = useRef(false)

  useEffect(() => {
    if (!seededRef.current && savedName !== undefined) {
      seededRef.current = true
      setDraft(savedName || '')
    }
  }, [savedName])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      await setDisplayName(draft.trim())
      setSaved(true)
    } catch (err) {
      setSaveError(err?.message || 'Η αποθήκευση του ονόματος απέτυχε. Δοκίμασε ξανά.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="section display-name-section">
      <h2>Εμφανιζόμενο όνομα</h2>
      <p className="hint">
        Το όνομα που θα βλέπεις στον χαιρετισμό της Αρχικής. Χωρίς ρύθμιση, η Αρχική δείχνει απλά
        «Καλημέρα».
      </p>
      <form onSubmit={handleSubmit} className="display-name-section__form" noValidate>
        <FormField htmlFor="display-name-input" label="Όνομα">
          <Input
            id="display-name-input"
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setSaved(false) }}
            placeholder="π.χ. Όλγα"
            maxLength={60}
          />
        </FormField>
        {saveError && <AlertBanner variant="danger">{saveError}</AlertBanner>}
        {saved && <AlertBanner variant="success">Αποθηκεύτηκε.</AlertBanner>}
        <div className="actions-row">
          <Button type="submit" variant="primary" loading={saving}>Αποθήκευση</Button>
        </div>
      </form>
    </div>
  )
}
