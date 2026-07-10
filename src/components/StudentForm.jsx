import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db.js'

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
  const [saving, setSaving] = useState(false)
  const [codeError, setCodeError] = useState(null)
  // Ref εκτός από state: το setState δεν εφαρμόζεται συγχρονισμένα, οπότε δύο κλικ στο ίδιο tick
  // (γρήγορο διπλό tap στο «Αποθήκευση») θα διάβαζαν και τα δύο το παλιό saving=false.
  const savingRef = useRef(false)
  // Στιγμιότυπο της φόρμας όπως φορτώθηκε αρχικά — χρησιμοποιείται μόνο για να ξέρουμε αν
  // ο χρήστης άλλαξε κάτι, ώστε το «Ακύρωση» να ρωτάει πριν πετάξει αλλαγές.
  const initialFormRef = useRef(mode === 'create' ? emptyStudent : null)

  useEffect(() => {
    if (mode !== 'edit') return
    db.students.get(Number(id)).then((student) => {
      if (student) {
        setForm(student)
        initialFormRef.current = student
      }
      setLoading(false)
    })
  }, [mode, id])

  function updateField(field, value) {
    if (field === 'code') setCodeError(null) // το προηγούμενο μήνυμα διπλότυπου δεν ισχύει πια για νέο κείμενο
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleCancel() {
    const isDirty = JSON.stringify(form) !== JSON.stringify(initialFormRef.current)
    if (isDirty && !window.confirm('Θα χαθούν οι αλλαγές που έκανες. Ακύρωση χωρίς αποθήκευση;')) {
      return
    }
    navigate(mode === 'create' ? '/students' : `/students/${id}`)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const code = form.code.trim()
    if (!code || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setCodeError(null)
    try {
      const existing = await db.students.where('code').equals(code).first()
      if (existing && existing.id !== Number(id)) {
        setCodeError(`Υπάρχει ήδη μαθητής με κωδικό «${code}».`)
        return
      }
      if (mode === 'create') {
        const newId = await db.students.add({ ...emptyStudent, ...form, code })
        navigate(`/students/${newId}`)
      } else {
        await db.students.update(Number(id), { ...form, code })
        navigate(`/students/${id}`)
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="page">Φόρτωση…</div>
  }

  return (
    <div className="page">
      <h1>{mode === 'create' ? 'Νέος μαθητής' : 'Επεξεργασία στοιχείων'}</h1>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="code">Κωδικός (π.χ. Μ1) *</label>
          <input
            id="code"
            type="text"
            required
            value={form.code}
            onChange={(e) => updateField('code', e.target.value)}
          />
          {codeError && <p className="hint">⚠️ {codeError}</p>}
        </div>

        <div className="field">
          <label htmlFor="nickname">Μικρό όνομα (προαιρετικό)</label>
          <input
            id="nickname"
            type="text"
            value={form.nickname}
            onChange={(e) => updateField('nickname', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="grade">Τάξη</label>
          <input
            id="grade"
            type="text"
            value={form.grade}
            onChange={(e) => updateField('grade', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="notes">Σημειώσεις</label>
          <textarea
            id="notes"
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
          />
        </div>

        <div className="actions-row">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={handleCancel}>
            Ακύρωση
          </button>
        </div>
      </form>
    </div>
  )
}
