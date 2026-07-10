import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { DOMAINS, domainName } from '../config/domains.js'
import { MEASUREMENT_TYPES } from '../config/measurementTypes.js'
import { PRIORITIES } from '../config/goalOptions.js'
import { todayLocalISO } from '../utils/date.js'
import TemplateSuggestions from './TemplateSuggestions.jsx'

const STEPS = ['Τομέας', 'Περιγραφή', 'Baseline', 'Κριτήριο', 'Τύπος μέτρησης']

// Συνάρτηση αντί για σταθερά: το startDate πρέπει να υπολογίζεται τη στιγμή που ανοίγει η φόρμα
// (mount), όχι μία φορά όταν φορτώνεται το module — αλλιώς, αν η καρτέλα μείνει ανοιχτή από το
// βράδυ ως το πρωί χωρίς reload, κάθε νέος στόχος θα έπαιρνε σιωπηλά τη χθεσινή ημερομηνία.
function createEmptyGoal() {
  return {
    domain: '',
    title: '',
    description: '',
    baseline: '',
    criterion: '',
    measurementType: '',
    supportLevel: '',
    priority: 'medium',
    startDate: todayLocalISO()
  }
}

// Φόρμα-οδηγός για δημιουργία/επεξεργασία στόχου: τομέας → περιγραφή → baseline → κριτήριο → τύπος μέτρησης.
export default function GoalWizardForm({ mode }) {
  const { id, goalId } = useParams()
  const navigate = useNavigate()
  const studentId = Number(id)

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  // Ref εκτός από state: το setState δεν εφαρμόζεται συγχρονισμένα, οπότε δύο κλικ στο ίδιο tick
  // (γρήγορο διπλό tap στο «Αποθήκευση στόχου») θα διάβαζαν και τα δύο το παλιό saving=false.
  const savingRef = useRef(false)
  // Πάντα πλήρες σχήμα (ποτέ {}) — ακόμα και σε edit mode πριν φορτωθούν τα πραγματικά δεδομένα,
  // αλλιώς το canProceed παρακάτω σκάει σε goal.title.trim() πάνω σε undefined όσο περιμένουμε το fetch.
  const [goal, setGoal] = useState(createEmptyGoal)
  // Στιγμιότυπο του στόχου όπως φορτώθηκε αρχικά — μόνο για να ξέρουμε αν ο χρήστης άλλαξε κάτι,
  // ώστε το «Ακύρωση» να ρωτάει πριν πετάξει αλλαγές. null σε edit mode μέχρι να φορτωθούν τα
  // πραγματικά δεδομένα (η φόρμα δεν είναι ούτως ή άλλως ορατή νωρίτερα, βλ. το loading guard).
  const initialGoalRef = useRef(mode === 'create' ? goal : null)

  useEffect(() => {
    if (mode !== 'edit') return
    db.goals.get(Number(goalId)).then((existing) => {
      if (existing) {
        setGoal(existing)
        initialGoalRef.current = existing
      }
      setLoading(false)
    })
  }, [mode, goalId])

  const template = useLiveQuery(
    () => (goal.domain ? db.domainTemplates.get(goal.domain) : undefined),
    [goal.domain]
  )
  const suggestedTypes = (template?.suggestedMeasurementTypes || [])
    .map((value) => MEASUREMENT_TYPES.find((m) => m.value === value))
    .filter(Boolean)

  function updateField(field, value) {
    setGoal((prev) => ({ ...prev, [field]: value }))
  }

  function handleCancel() {
    const isDirty = JSON.stringify(goal) !== JSON.stringify(initialGoalRef.current)
    if (isDirty && !window.confirm('Θα χαθούν οι αλλαγές που έκανες. Ακύρωση χωρίς αποθήκευση;')) {
      return
    }
    navigate(`/students/${studentId}`)
  }

  const canProceed = {
    0: goal.domain !== '',
    1: goal.title.trim() !== '',
    2: true,
    3: true,
    4: goal.measurementType !== ''
  }[step]

  async function handleSave() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      if (mode === 'edit') {
        await db.goals.update(Number(goalId), goal)
      } else {
        await db.goals.add({ ...goal, studentId, status: 'active', statusChangedAt: new Date().toISOString() })
      }
      navigate(`/students/${studentId}`)
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
      <h1>{mode === 'edit' ? 'Επεξεργασία στόχου' : 'Νέος στόχος'}</h1>

      <div className="wizard-dots">
        {STEPS.map((label, i) => (
          <span key={label} className={`wizard-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      <div className="section">
        {step === 0 && (
          <div className="field">
            <label htmlFor="domain">Τομέας *</label>
            <select id="domain" value={goal.domain} onChange={(e) => updateField('domain', e.target.value)}>
              <option value="">— Επίλεξε τομέα —</option>
              {DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="field">
              <label htmlFor="title">Τίτλος στόχου *</label>
              <input
                id="title"
                type="text"
                value={goal.title}
                onChange={(e) => updateField('title', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="description">Περιγραφή</label>
              <textarea
                id="description"
                value={goal.description}
                onChange={(e) => updateField('description', e.target.value)}
              />
            </div>
            <TemplateSuggestions
              domain={goal.domain}
              field="goalStarters"
              label="Προτάσεις διατύπωσης στόχου (κλικ για συμπλήρωση της περιγραφής)"
              onApply={(value) => updateField('description', value)}
            />
          </>
        )}

        {step === 2 && (
          <div className="field">
            <label htmlFor="baseline">Baseline (σημείο εκκίνησης)</label>
            <textarea
              id="baseline"
              value={goal.baseline}
              onChange={(e) => updateField('baseline', e.target.value)}
            />
            <p className="hint">Τι κάνει ο μαθητής σήμερα</p>
            <TemplateSuggestions
              domain={goal.domain}
              field="baselineExamples"
              label="Παραδείγματα διατύπωσης baseline"
              onApply={(value) => updateField('baseline', value)}
            />
          </div>
        )}

        {step === 3 && (
          <div className="field">
            <label htmlFor="criterion">Κριτήριο επιτυχίας</label>
            <input
              id="criterion"
              type="text"
              placeholder="π.χ. 4 από 5 προσπάθειες"
              value={goal.criterion}
              onChange={(e) => updateField('criterion', e.target.value)}
            />
            <TemplateSuggestions
              domain={goal.domain}
              field="commonCriteria"
              label="Συνηθισμένα κριτήρια"
              onApply={(value) => updateField('criterion', value)}
            />
          </div>
        )}

        {step === 4 && (
          <>
            <div className="field">
              <label htmlFor="measurementType">Τύπος μέτρησης *</label>
              <select
                id="measurementType"
                value={goal.measurementType}
                onChange={(e) => updateField('measurementType', e.target.value)}
              >
                <option value="">— Επίλεξε τύπο —</option>
                {MEASUREMENT_TYPES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {goal.measurementType && (
                <p className="hint">
                  {MEASUREMENT_TYPES.find((m) => m.value === goal.measurementType)?.hint}
                </p>
              )}
            </div>

            {suggestedTypes.length > 0 && (
              <div className="suggestions">
                <p className="hint">Προτεινόμενοι τύποι για τον τομέα «{domainName(goal.domain)}» (κλικ για επιλογή)</p>
                <div className="chip-list">
                  {suggestedTypes.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      className={`chip ${goal.measurementType === m.value ? 'chip-selected' : ''}`}
                      onClick={() => updateField('measurementType', m.value)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="supportLevel">Επίπεδο στήριξης</label>
              <input
                id="supportLevel"
                type="text"
                placeholder="π.χ. με λεκτική υπόδειξη"
                value={goal.supportLevel}
                onChange={(e) => updateField('supportLevel', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="priority">Προτεραιότητα</label>
              <select id="priority" value={goal.priority} onChange={(e) => updateField('priority', e.target.value)}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="startDate">Ημερομηνία έναρξης</label>
              <input
                id="startDate"
                type="date"
                value={goal.startDate}
                onChange={(e) => updateField('startDate', e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="actions-row">
        {step > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => setStep(step - 1)}>← Πίσω</button>
        )}
        {step < STEPS.length - 1 && (
          <button type="button" className="btn btn-primary" disabled={!canProceed} onClick={() => setStep(step + 1)}>
            Επόμενο →
          </button>
        )}
        {step === STEPS.length - 1 && (
          <button type="button" className="btn btn-primary" disabled={!canProceed || saving} onClick={handleSave}>
            {saving ? 'Αποθήκευση…' : 'Αποθήκευση στόχου'}
          </button>
        )}
        <button type="button" className="btn btn-link" onClick={handleCancel}>
          Ακύρωση
        </button>
      </div>
    </div>
  )
}
