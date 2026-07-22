import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Library } from 'lucide-react'
import { db, createGoal } from '../db.js'
import { DOMAINS } from '../config/domains.js'
import { PRIORITIES } from '../config/goalOptions.js'
import { isRecommendedMeasurementType } from '../config/measurementRecommendations.js'
import { todayLocalISO } from '../utils/date.js'
import { listMeasurementTypes, validateCriterionConfig } from '../utils/measurementTypes/index.js'
import { decideMeasurementTypeChange, applyMeasurementTypeChange, hasCriterionContent } from '../utils/measurementTypeChange.js'
import { getCriterionPanel } from './criterionPanelRegistry.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import Card from './ui/Card.jsx'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import Select from './ui/Select.jsx'
import Textarea from './ui/Textarea.jsx'
import MeasurementTypeCard from './ui/MeasurementTypeCard.jsx'
import TemplateSuggestions from './TemplateSuggestions.jsx'
import GoalLibraryPicker from './GoalLibraryPicker.jsx'
import './GoalWizardForm.css'

// Οι 4 «υπάρχοντες» τύποι πριν την επανασχεδίαση του Step 3 (Product Design §3) — οι υπόλοιποι 4
// παίρνουν ένα «ΝΕΟ» badge στην κάρτα τους. Καθαρά παρουσιαστικό, καμία επίδραση σε λογική.
const EXISTING_MEASUREMENT_TYPES = new Set(['successRatio', 'taskAnalysis', 'promptLevel', 'duration'])

// 3 παιδαγωγικά βήματα (Technical Plan Στάδιο 4, Product Design §4) — όχι 5 μηχανικά. Κάθε βήμα
// έχει ΔΙΚΑ ΤΟΥ απαιτούμενα πεδία (βλ. validateStep) — προτεραιότητα/επίπεδο στήριξης/ημερομηνία
// έναρξης είναι πάντα προαιρετικά, μέσα στην ενότητα «Άλλες λεπτομέρειες» του 3ου βήματος.
const STEPS = [
  { key: 'focus', label: 'Τι θέλουμε να πετύχει' },
  { key: 'baseline', label: 'Σημείο εκκίνησης' },
  { key: 'criterion', label: 'Κριτήριο & Μέτρηση' }
]

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
    // Goal Wizard Step 3 redesign (Technical Plan Στάδιο 3) — δομημένο πεδίο, γεμίζει ΜΟΝΟ μέσω
    // applyMeasurementTypeChange() όταν επιλέγεται/αλλάζει τύπος. Τα δυναμικά panels που το
    // επεξεργάζονται πραγματικά έρχονται στο Στάδιο 4+· εδώ απλά κρατά σωστό, καθαρό σχήμα.
    criterionConfig: null,
    supportLevel: '',
    priority: 'medium',
    startDate: todayLocalISO()
  }
}

// Φόρμα-οδηγός για δημιουργία/επεξεργασία στόχου. Μία ενιαία `goal` state object σε όλο το
// component — το `step` είναι ΜΟΝΟ δείκτης θέσης στο UI, ποτέ δεν επηρεάζει/καθαρίζει δεδομένα.
// Πίσω/Επόμενο αλλάζουν μόνο το `step` — αυτό εγγυάται από μόνο του ότι καμία τιμή δεν χάνεται
// μετακινούμενος μεταξύ βημάτων (Technical Plan Στάδιο 4, σημείο 3).
export default function GoalWizardForm({ mode }) {
  const { id, goalId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const studentId = Number(id)

  // Προσυμπλήρωση από «Αντιγραφή σε άλλον μαθητή» (CopyGoalToStudentModal.jsx) — περνιέται μέσω
  // react-router state, ΟΧΙ μέσω δημιουργίας οτιδήποτε στη βάση πριν ολοκληρωθεί ο Wizard
  // (Technical Plan Στάδιο 7, σημείο 5). Μόνο σε create mode· άσχετο/αγνοείται σε edit.
  const locationPrefill = mode === 'create' ? location.state?.prefill : null

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  // Goal Wizard Step 3 redesign (Technical Plan Στάδιο 3) — αν ο στόχος έχει ήδη μετρήσεις, η
  // αλλαγή measurementType εδώ είναι αδύνατη (βλ. κάρτες παρακάτω). Πάντα false σε create mode
  // (ένας στόχος που δεν έχει αποθηκευτεί ακόμα δεν μπορεί να έχει μετρήσεις).
  const [hasMeasurements, setHasMeasurements] = useState(false)
  // Ο τύπος που περιμένει επιβεβαίωση (θα αντικαθιστούσε ήδη συμπληρωμένο criterion/criterionConfig)
  // — null όταν κλειστό. ΔΕΝ εφαρμόζεται καμία αλλαγή μέχρι ρητή επιβεβαίωση (Στάδιο 3, σημεία 4/5).
  const [pendingTypeChange, setPendingTypeChange] = useState(null)
  // true αν ο στόχος ξεκίνησε από πρότυπο βιβλιοθήκης Ή από αντιγραφή άλλου στόχου — μόνο για μια
  // ήπια υπενθύμιση στο βήμα baseline (§5, R8: το baseline είναι πάντα κενό σε αυτές τις περιπτώσεις
  // και χρειάζεται ΝΕΟ, φρέσκο κείμενο για ΑΥΤΟΝ τον μαθητή) — δεν μπλοκάρει τίποτα από μόνο του,
  // το ήδη υπάρχον «baseline υποχρεωτικό» validation του Βήματος 2 είναι η πραγματική διασφάλιση.
  const [cameFromReuse, setCameFromReuse] = useState(Boolean(locationPrefill))
  // Ένα ΤΟ ΠΟΛΥ ενεργό field error τη φορά — αντιστοιχεί στο πρώτο μη έγκυρο πεδίο του τρέχοντος
  // βήματος (βλ. validateStep/goNext). Καθαρίζεται όταν αλλάζει το ίδιο το πεδίο ή το βήμα.
  const [fieldErrors, setFieldErrors] = useState({})
  // Ref εκτός από state: το setState δεν εφαρμόζεται συγχρονισμένα, οπότε δύο κλικ στο ίδιο tick
  // (γρήγορο διπλό tap στο «Αποθήκευση στόχου») θα διάβαζαν και τα δύο το παλιό saving=false.
  const savingRef = useRef(false)
  // Πάντα πλήρες σχήμα (ποτέ {}) — ακόμα και σε edit mode πριν φορτωθούν τα πραγματικά δεδομένα,
  // αλλιώς το validateStep παρακάτω σκάει σε goal.title.trim() πάνω σε undefined όσο περιμένουμε το fetch.
  const [goal, setGoal] = useState(() => ({ ...createEmptyGoal(), ...locationPrefill }))
  // Στιγμιότυπο του στόχου όπως φορτώθηκε αρχικά — μόνο για να ξέρουμε αν ο χρήστης άλλαξε κάτι,
  // ώστε το «Πίσω»/«Ακύρωση» να ρωτάει πριν πετάξει αλλαγές. null σε edit mode μέχρι να φορτωθούν
  // τα πραγματικά δεδομένα (η φόρμα δεν είναι ούτως ή άλλως ορατή νωρίτερα, βλ. το loading guard).
  // ΣΗΜΕΙΩΣΗ: όταν υπάρχει locationPrefill, το initial snapshot ΕΙΝΑΙ το προσυμπληρωμένο goal —
  // το «isDirty» εδώ αφορά αλλαγές που κάνει ο εκπαιδευτικός ΠΑΝΩ στην προσυμπλήρωση, όχι το αν
  // υπάρχει προσυμπλήρωση καθαυτή (το picker/copy modal έχουν ήδη τη ΔΙΚΗ ΤΟΥΣ λογική «θα
  // αντικατασταθούν τα δεδομένα» πριν φτάσουμε ως εδώ).
  const initialGoalRef = useRef(mode === 'create' ? goal : null)

  const domainRef = useRef(null)
  const titleRef = useRef(null)
  const baselineRef = useRef(null)
  const criterionRef = useRef(null)
  const measurementTypeRef = useRef(null)
  const criterionPanelRef = useRef(null)
  // Στο βήμα 3, το πρώτο πεδίο ΟΠΤΙΚΑ είναι πλέον οι κάρτες τύπου (Οθόνη Α πριν το κριτήριο,
  // Product Design §4) — το auto-focus στην άφιξη στο βήμα ακολουθεί την ίδια σειρά.
  const stepFieldRefs = [domainRef, baselineRef, measurementTypeRef]

  useEffect(() => {
    if (mode !== 'edit') return
    // ΔΥΟ ξεχωριστά queries, ένα ανά πίνακα (goals/measurements) — ίδιο idiom με το υπόλοιπο
    // codebase, καμία μεταλλαγμένη λογική πάνω στο goal.criterion για να «μαντέψει» criterionConfig
    // (Στάδιο 3, σημείο 3: legacy goal χωρίς criterionConfig ανοίγει ΑΚΡΙΒΩΣ όπως είναι στη βάση).
    Promise.all([
      db.goals.get(Number(goalId)),
      db.measurements.where('goalId').equals(Number(goalId)).count()
    ]).then(([existing, measurementCount]) => {
      if (existing) {
        setGoal(existing)
        initialGoalRef.current = existing
        setHasMeasurements(measurementCount > 0)
      }
      setLoading(false)
    })
  }, [mode, goalId])

  // Focus στο πρώτο πεδίο του νέου βήματος — «το focus μετακινείται λογικά όταν αλλάζει βήμα»
  // (Technical Plan Στάδιο 4, σημείο 7). Τρέχει και στο αρχικό mount (loading → false), ίδιο
  // idiom με το autoFocus του StudentForm.jsx.
  useEffect(() => {
    if (loading) return
    stepFieldRefs[step]?.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading])

  function updateField(field, value) {
    setGoal((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: null } : prev))
  }

  // Οθόνη Α — επιλογή κάρτας τύπου μέτρησης (Technical Plan Στάδιο 3). Η καθαρή απόφαση («τι θα
  // έπρεπε να συμβεί») ζει στο utils/measurementTypeChange.js, τεσταρισμένη ανεξάρτητα από αυτό το
  // component — εδώ μόνο εφαρμόζεται το αποτέλεσμα.
  function handleTypeSelect(nextType) {
    const decision = decideMeasurementTypeChange(goal, nextType, hasMeasurements)
    if (decision === 'noop' || decision === 'blocked') return
    if (decision === 'confirm') {
      setPendingTypeChange(nextType)
      return
    }
    setGoal((prev) => ({ ...prev, ...applyMeasurementTypeChange(nextType) }))
    setFieldErrors((prev) => (prev.measurementType ? { ...prev, measurementType: null } : prev))
  }

  function confirmTypeChange() {
    setGoal((prev) => ({ ...prev, ...applyMeasurementTypeChange(pendingTypeChange) }))
    setFieldErrors((prev) => (prev.measurementType ? { ...prev, measurementType: null } : prev))
    setPendingTypeChange(null)
  }

  function cancelTypeChange() {
    setPendingTypeChange(null)
  }

  // onApply του GoalLibraryPicker — το picker ΕΧΕΙ ΗΔΗ αποφασίσει (και επιβεβαιώσει αν χρειαζόταν)
  // ότι πρέπει να εφαρμοστεί· εδώ απλά συγχωνεύουμε (Technical Plan Στάδιο 7, σημείο 3). Το
  // prefill περιέχει ΜΟΝΟ τα whitelist πεδία + κενό baseline (prefillFromSource) — supportLevel/
  // priority/startDate παραμένουν ό,τι ήταν ήδη στη φόρμα.
  function handleApplyTemplate(prefill) {
    setGoal((prev) => ({ ...prev, ...prefill }))
    setCameFromReuse(true)
    setFieldErrors({})
    setLibraryPickerOpen(false)
  }

  function isDirty() {
    return JSON.stringify(goal) !== JSON.stringify(initialGoalRef.current)
  }

  const leaveTo = `/students/${studentId}`

  function requestLeave() {
    if (isDirty()) {
      setConfirmDiscardOpen(true)
    } else {
      navigate(leaveTo)
    }
  }

  // Ελέγχει ΜΟΝΟ τα πεδία του δοσμένου βήματος (Technical Plan Στάδιο 4, σημείο 4) — επιστρέφει
  // το ΠΡΩΤΟ μη έγκυρο πεδίο (ή null αν όλα έγκυρα), ποτέ όλα τα σφάλματα μαζί.
  function validateStep(stepIndex) {
    if (stepIndex === 0) {
      if (goal.domain === '') return { field: 'domain', message: 'Επίλεξε τομέα.', ref: domainRef }
      if (goal.title.trim() === '') return { field: 'title', message: 'Ο τίτλος είναι υποχρεωτικός.', ref: titleRef }
    } else if (stepIndex === 1) {
      if (goal.baseline.trim() === '') {
        return { field: 'baseline', message: 'Το σημείο εκκίνησης είναι υποχρεωτικό — τι κάνει σήμερα ο μαθητής;', ref: baselineRef }
      }
    } else if (stepIndex === 2) {
      if (goal.measurementType === '') return { field: 'measurementType', message: 'Επίλεξε τύπο μέτρησης.', ref: measurementTypeRef }
      // Στάδιο 4 — τύποι με δικό τους panel (criterionConfig ήδη γεμάτο μέσω applyMeasurementTypeChange,
      // βλ. σχόλιο στο createEmptyGoal) επικυρώνονται μέσω του ήδη υπάρχοντος validateCriterionConfig
      // (Στάδιο 1), ΟΧΙ με νέο, παράλληλο σύνολο κανόνων εδώ. Legacy/μη-migrated τύποι κρατούν τον
      // σημερινό έλεγχο στο ελεύθερο κείμενο criterion.
      const CriterionPanel = getCriterionPanel(goal.measurementType)
      if (CriterionPanel && goal.criterionConfig) {
        try {
          validateCriterionConfig(goal.measurementType, goal.criterionConfig)
        } catch (err) {
          return { field: 'criterionConfig', message: err.message, ref: criterionPanelRef }
        }
      } else if (goal.criterion.trim() === '') {
        return { field: 'criterion', message: 'Το κριτήριο είναι υποχρεωτικό.', ref: criterionRef }
      }
    }
    return null
  }

  function goNext() {
    const error = validateStep(step)
    if (error) {
      setFieldErrors({ [error.field]: error.message })
      error.ref.current?.focus()
      return
    }
    setFieldErrors({})
    setStep((s) => s + 1)
  }

  function goBack() {
    setFieldErrors({})
    setStep((s) => s - 1)
  }

  async function handleSave() {
    const error = validateStep(step)
    if (error) {
      setFieldErrors({ [error.field]: error.message })
      error.ref.current?.focus()
      return
    }
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      // Το criterionConfig (Στάδιο 3) γεμίζει με το ΚΕΝΟ σχήμα του τύπου μόλις επιλεγεί κάρτα
      // (createEmptyCriterionConfig) — αλλά τα δυναμικά panels που το επεξεργάζονται πραγματικά
      // είναι Στάδιο 4+, ΔΕΝ υπάρχουν ακόμα. Αν το στείλουμε ως έχει (κενό), το ήδη υπάρχον
      // validateCriterionConfig (Στάδιο 1) θα το απορρίψει ως μη έγκυρο. Άρα: στέλνεται ΜΟΝΟ όταν
      // έχει πραγματικό περιεχόμενο — αλλιώς παραλείπεται εντελώς, ώστε να ισχύσει το ήδη υπάρχον
      // legacy μονοπάτι (ελεύθερο κείμενο criterion, όπως σήμερα) μέχρι να υπάρξουν τα panels.
      const { criterionConfig, ...restFields } = goal
      const fieldsToSave = hasCriterionContent({ criterion: '', criterionConfig })
        ? goal
        : restFields

      if (mode === 'edit') {
        // Το `goal` state φορτώθηκε από την πλήρη υπάρχουσα εγγραφή (βλ. useEffect παραπάνω), άρα
        // περιέχει ήδη status/statusChangedAt — αφαιρούνται ρητά εδώ ώστε να είναι ΔΟΜΙΚΑ αδύνατο
        // αυτό το save να αγγίξει ποτέ την κατάσταση ή να δημιουργήσει goalEvent (Technical Plan
        // Στάδιο 3/4 — μοναδικό API για αλλαγή κατάστασης είναι το transitionGoalStatus).
        const { status: _status, statusChangedAt: _statusChangedAt, ...editableFields } = fieldsToSave
        await db.goals.update(Number(goalId), editableFields)
      } else {
        // createGoal (Στάδιο 2) — ατομικό goal+'created' goalEvent, επιβάλλει πάντα status:'active'.
        await createGoal({ ...fieldsToSave, studentId })
      }
      navigate(`/students/${studentId}`)
    } catch (err) {
      console.error(err)
      setSaveError('Η αποθήκευση απέτυχε. Δοκίμασε ξανά — οι τιμές σου παραμένουν όπως τις άφησες.')
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

  const isLastStep = step === STEPS.length - 1

  return (
    <AppShell>
      <PageHeader
        title={mode === 'edit' ? `Επεξεργασία στόχου — ${initialGoalRef.current?.title}` : 'Νέος στόχος'}
        back={{ label: 'Πίσω', onClick: requestLeave, disabled: saving }}
      />

      {saveError && (
        <AlertBanner variant="danger" icon={AlertTriangle} className="goal-wizard__alert">
          {saveError}
        </AlertBanner>
      )}

      <nav className="goal-wizard__steps" aria-label="Βήματα δημιουργίας στόχου">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`goal-wizard__step ${i === step ? 'goal-wizard__step--current' : ''} ${i < step ? 'goal-wizard__step--done' : ''}`}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="goal-wizard__step-number" aria-hidden="true">{i < step ? '✓' : i + 1}</span>
            <span className="goal-wizard__step-label">{s.label}</span>
          </div>
        ))}
      </nav>
      <p className="goal-wizard__step-mobile">Βήμα {step + 1} από {STEPS.length}: {STEPS[step].label}</p>

      <Card className="goal-wizard__card">
        {step === 0 && (
          <>
            {mode === 'create' && (
              <Button
                variant="secondary"
                icon={Library}
                className="goal-wizard__library-btn"
                onClick={() => setLibraryPickerOpen(true)}
              >
                Ξεκίνα από τη Βιβλιοθήκη
              </Button>
            )}

            <FormField htmlFor="goalDomain" label="Τομέας" required error={fieldErrors.domain}>
              <Select
                ref={domainRef}
                id="goalDomain"
                value={goal.domain}
                onChange={(e) => updateField('domain', e.target.value)}
                error={!!fieldErrors.domain}
                aria-invalid={fieldErrors.domain ? 'true' : undefined}
              >
                <option value="">— Επίλεξε τομέα —</option>
                {DOMAINS.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </FormField>

            <FormField htmlFor="goalTitle" label="Τι θέλουμε να πετύχει" required error={fieldErrors.title}>
              <Input
                ref={titleRef}
                id="goalTitle"
                type="text"
                value={goal.title}
                onChange={(e) => updateField('title', e.target.value)}
                error={!!fieldErrors.title}
                aria-invalid={fieldErrors.title ? 'true' : undefined}
              />
            </FormField>

            <FormField htmlFor="goalDescription" label="Περιγραφή (προαιρετικά)">
              <Textarea
                id="goalDescription"
                value={goal.description}
                onChange={(e) => updateField('description', e.target.value)}
              />
            </FormField>

            <TemplateSuggestions
              domain={goal.domain}
              field="goalStarters"
              label="Προτάσεις διατύπωσης στόχου (κλικ για συμπλήρωση της περιγραφής)"
              onApply={(value) => updateField('description', value)}
            />
          </>
        )}

        {step === 1 && (
          <>
            <FormField
              htmlFor="goalBaseline"
              label="Τι κάνει σήμερα ο μαθητής"
              required
              helperText={
                cameFromReuse
                  ? 'Το σημείο εκκίνησης είναι πάντα κενό όταν ξεκινάς από πρότυπο ή αντιγραφή — γράψε το δικό ΤΟΥ, ΑΥΤΟΥ του μαθητή.'
                  : 'Το σημείο εκκίνησης — χωρίς αυτό δεν έχει νόημα το κριτήριο επιτυχίας.'
              }
              error={fieldErrors.baseline}
            >
              <Textarea
                ref={baselineRef}
                id="goalBaseline"
                value={goal.baseline}
                onChange={(e) => updateField('baseline', e.target.value)}
                error={!!fieldErrors.baseline}
                aria-invalid={fieldErrors.baseline ? 'true' : undefined}
              />
            </FormField>
            <TemplateSuggestions
              domain={goal.domain}
              field="baselineExamples"
              label="Παραδείγματα διατύπωσης σημείου εκκίνησης"
              onApply={(value) => updateField('baseline', value)}
            />
          </>
        )}

        {step === 2 && (
          <>
            {/* Οθόνη Α (Product Design §4) — πρώτα «πώς θα παρακολουθώ», ΠΡΙΝ το κριτήριο. Κάρτες
                αποκλειστικά από το registry (listMeasurementTypes) — καμία δεύτερη hardcoded λίστα
                τύπων εδώ (Technical Plan Στάδιο 3, σημείο 1). */}
            <FormField
              label="Πώς θα παρακολουθώ"
              required
              error={fieldErrors.measurementType}
            >
              {hasMeasurements && (
                <div id="measurementTypeLockedHint">
                  <AlertBanner variant="info">
                    Αυτός ο στόχος έχει ήδη μετρήσεις. Η αλλαγή τρόπου παρακολούθησης δεν επιτρέπεται
                    εδώ, γιατί θα αλλοίωνε τη σημασία των υπαρχόντων καταγραφών. Αν χρειάζεσαι
                    διαφορετικό τρόπο παρακολούθησης, δημιούργησε νέο στόχο από αυτόν (στη σελίδα του
                    στόχου, «Νέος στόχος από αυτόν»).
                  </AlertBanner>
                </div>
              )}
              <div
                ref={measurementTypeRef}
                tabIndex={-1}
                role="radiogroup"
                aria-label="Πώς θα παρακολουθώ"
                aria-invalid={fieldErrors.measurementType ? 'true' : undefined}
                className="measurement-type-card-grid"
              >
                {listMeasurementTypes().map((type) => (
                  <MeasurementTypeCard
                    key={type.value}
                    type={type}
                    name="measurementType"
                    selected={goal.measurementType === type.value}
                    disabled={hasMeasurements && goal.measurementType !== type.value}
                    isNew={!EXISTING_MEASUREMENT_TYPES.has(type.value)}
                    recommended={Boolean(goal.domain) && isRecommendedMeasurementType(goal.domain, type.value)}
                    onSelect={handleTypeSelect}
                    describedById={hasMeasurements ? 'measurementTypeLockedHint' : undefined}
                  />
                ))}
              </div>
            </FormField>

            {/* Οθόνη Β, απλοί τύποι (Technical Plan Στάδιο 4) — δυναμικό panel ΜΟΝΟ όταν ο τύπος
                έχει ήδη δικό του module ΚΑΙ το criterionConfig είναι ήδη γεμάτο (πάντα μέσω
                applyMeasurementTypeChange, ΠΟΤΕ αυτόματα από legacy κείμενο — βλ. registry). Για
                τους υπόλοιπους τύπους (Στάδια 5-7 ακόμα) ή legacy goals χωρίς criterionConfig,
                μένει το ήδη υπάρχον ελεύθερο κείμενο, ΑΚΡΙΒΩΣ όπως σήμερα. */}
            {(() => {
              const CriterionPanel = getCriterionPanel(goal.measurementType)
              if (CriterionPanel && goal.criterionConfig) {
                return (
                  <div ref={criterionPanelRef} tabIndex={-1}>
                    <CriterionPanel
                      criterionConfig={goal.criterionConfig}
                      onChange={(nextConfig) => updateField('criterionConfig', nextConfig)}
                      error={fieldErrors.criterionConfig}
                    />
                  </div>
                )
              }
              return (
                <>
                  <FormField htmlFor="goalCriterion" label="Κριτήριο επιτυχίας" required error={fieldErrors.criterion}>
                    <Input
                      ref={criterionRef}
                      id="goalCriterion"
                      type="text"
                      placeholder="π.χ. 4 από 5 προσπάθειες"
                      value={goal.criterion}
                      onChange={(e) => updateField('criterion', e.target.value)}
                      error={!!fieldErrors.criterion}
                      aria-invalid={fieldErrors.criterion ? 'true' : undefined}
                    />
                  </FormField>
                  <TemplateSuggestions
                    domain={goal.domain}
                    field="commonCriteria"
                    label="Συνηθισμένα κριτήρια"
                    onApply={(value) => updateField('criterion', value)}
                  />
                </>
              )
            })()}

            {/* Native <details>/<summary> — ίδιο idiom με το «Ιστορικό δραστηριότητας» του
                StudentProfile.jsx: ενσωματωμένη προσβασιμότητα (πληκτρολόγιο, aria-expanded
                μέσω του browser) χωρίς χειροκίνητο JS state, και τα πεδία ΠΟΤΕ δεν αποσυνδέονται
                από το DOM όταν είναι κλειστό — οι τιμές τους παραμένουν ανέπαφες πάντα. */}
            <details className="goal-wizard__details">
              <summary>Άλλες λεπτομέρειες (προαιρετικά)</summary>
              <div className="goal-wizard__details-body">
                {/* Ενιαία ορολογία «υποστήριξη» (ΠΟΤΕ «στήριξη», διόρθωση χρήστη Σταδίου 4) — και
                    ρητά ξεχωριστό, με δικό του helperText, από την κάρτα/panel «Επίπεδο
                    υποστήριξης» παραπάνω: εκεί ορίζεται το ΚΡΙΤΗΡΙΟ ολοκλήρωσης όταν ο τρόπος
                    μέτρησης είναι promptLevel· εδώ είναι μια ελεύθερη, προαιρετική σημείωση για
                    ΤΟ ΤΡΕΧΟΝ πλαίσιο υποστήριξης, ανεξάρτητη από τον τρόπο μέτρησης — ισχύει (ή
                    όχι) για στόχο ΟΠΟΙΟΥΔΗΠΟΤΕ τύπου (Product Design §6). */}
                <FormField
                  htmlFor="goalSupportLevel"
                  label="Τρέχουσα υποστήριξη"
                  helperText="Προαιρετική σημείωση για το πλαίσιο υποστήριξης αυτή τη στιγμή — ανεξάρτητη από το κριτήριο ολοκλήρωσης του στόχου."
                >
                  <Input
                    id="goalSupportLevel"
                    type="text"
                    placeholder="π.χ. με λεκτική υπόδειξη"
                    value={goal.supportLevel}
                    onChange={(e) => updateField('supportLevel', e.target.value)}
                  />
                </FormField>
                <FormField htmlFor="goalPriority" label="Προτεραιότητα">
                  <Select id="goalPriority" value={goal.priority} onChange={(e) => updateField('priority', e.target.value)}>
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField htmlFor="goalStartDate" label="Ημερομηνία έναρξης">
                  <Input
                    id="goalStartDate"
                    type="date"
                    value={goal.startDate}
                    onChange={(e) => updateField('startDate', e.target.value)}
                  />
                </FormField>
              </div>
            </details>
          </>
        )}

        <div className="goal-wizard__actions">
          {step > 0 && (
            <Button variant="ghost" onClick={goBack} disabled={saving}>← Πίσω</Button>
          )}
          {!isLastStep && (
            <Button variant="primary" onClick={goNext}>Επόμενο →</Button>
          )}
          {isLastStep && (
            <Button variant="primary" loading={saving} onClick={handleSave}>Αποθήκευση στόχου</Button>
          )}
        </div>
      </Card>

      <Modal
        open={confirmDiscardOpen}
        onClose={() => setConfirmDiscardOpen(false)}
        title="Μη αποθηκευμένες αλλαγές"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscardOpen(false)}>Συνέχεια επεξεργασίας</Button>
            <Button variant="danger" onClick={() => navigate(leaveTo)}>Απόρριψη αλλαγών</Button>
          </>
        }
      >
        <p>Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί σε αυτόν τον στόχο. Αν φύγεις τώρα, θα χαθούν.</p>
      </Modal>

      {/* Επιβεβαίωση αλλαγής τύπου μέτρησης (Technical Plan Στάδιο 3, σημεία 4/5) — ανοίγει ΜΟΝΟ
          όταν decideMeasurementTypeChange επιστρέψει 'confirm' (κάτι θα χανόταν). Ίδιο idiom Modal
          + ghost/danger footer με το confirmDiscardOpen παραπάνω. */}
      <Modal
        open={pendingTypeChange !== null}
        onClose={cancelTypeChange}
        title="Αλλαγή τρόπου παρακολούθησης"
        footer={
          <>
            <Button variant="ghost" onClick={cancelTypeChange}>Ακύρωση</Button>
            <Button variant="danger" onClick={confirmTypeChange}>Αλλαγή τύπου</Button>
          </>
        }
      >
        <p>Έχεις ήδη συμπληρώσει στοιχεία κριτηρίου για τον τρέχοντα τρόπο παρακολούθησης. Η αλλαγή θα τα καθαρίσει, ώστε να ξεκινήσεις καθαρά με τον νέο τύπο.</p>
      </Modal>

      {mode === 'create' && (
        <GoalLibraryPicker
          open={libraryPickerOpen}
          onClose={() => setLibraryPickerOpen(false)}
          onApply={handleApplyTemplate}
          isDirty={isDirty()}
        />
      )}
    </AppShell>
  )
}
