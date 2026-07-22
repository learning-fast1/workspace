import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle } from 'lucide-react'
import { db, applySchoolYearTransition } from '../db.js'
import { domainName } from '../config/domains.js'
import { statusLabel } from '../config/goalOptions.js'
import { suggestSchoolYearDates, suggestSchoolYearLabel } from '../utils/schoolYear.js'
import { buildParticipationDecisions, buildGoalDecisions, summarizeTransition } from '../utils/schoolYearTransitionPayload.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import Card from './ui/Card.jsx'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import AlertBanner from './ui/AlertBanner.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import ToggleRow from './ui/ToggleRow.jsx'
import ChoiceGroup from './ui/ChoiceGroup.jsx'
import './YearTransitionWizard.css'

// 4 βήματα (Technical Plan Στάδιο 10, σημείο 3 — review ΠΡΙΝ το τελικό, μη αναστρέψιμο κουμπί).
const STEPS = [
  { key: 'year', label: 'Νέο σχολικό έτος' },
  { key: 'students', label: 'Μαθητές' },
  { key: 'goals', label: 'Στόχοι' },
  { key: 'review', label: 'Ανασκόπηση' }
]

// Ζωντανοί στόχοι — μόνο αυτοί χρειάζονται απόφαση μετάβασης, ίδιο σύνολο με το GoalsList.jsx
// (achieved/archived είναι ήδη «κλειστή υπόθεση», καμία ερώτηση γι' αυτούς).
const LIVE_STATUSES = ['active', 'paused']

// Ακριβώς οι 3 εγκεκριμένες επιλογές (σημείο 4) — «Συνέχεια» για paused goal ΔΕΝ σημαίνει
// επανενεργοποίηση (σημείο 5, δυναμικό helperText παρακάτω)· «Νέος στόχος από αυτόν» εξηγεί ρητά
// τις συνέπειες (αρχειοθέτηση παλιού + κενό baseline) ώστε να μη μοιάζει με αθώα αντιγραφή.
function goalDecisionOptions(goal) {
  return [
    {
      value: 'continue',
      label: 'Συνέχεια',
      helperText: goal.status === 'paused'
        ? 'Παραμένει σε παύση — δεν ενεργοποιείται ξανά μόνο επειδή αλλάζει το σχολικό έτος.'
        : 'Καμία αλλαγή στον στόχο.'
    },
    { value: 'achieved', label: 'Ολοκληρώθηκε' },
    {
      value: 'newGoal',
      label: 'Νέος στόχος από αυτόν',
      helperText: 'Ο τρέχων στόχος θα αρχειοθετηθεί αυτόματα. Θα δημιουργηθεί νέος, ενεργός στόχος με άδειο baseline — θα χρειαστεί να το συμπληρώσεις αργότερα.'
    }
  ]
}

export default function YearTransitionWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  // «Έχουν γίνει επιλογές;» (σημείο 8) — ΟΧΙ βαθύ diff πάνω σε ασύγχρονα φορτωμένα δεδομένα
  // (participation/goalDecisions γεμίζουν μόνα τους με προεπιλογές μόλις φορτώσουν οι μαθητές/
  // στόχοι)· ένα απλό flag που γίνεται true ΜΟΝΟ από πραγματική ενέργεια του χρήστη.
  const [dirty, setDirty] = useState(false)

  const [yearFields, setYearFields] = useState(() => {
    const today = new Date()
    return { label: suggestSchoolYearLabel(today), ...suggestSchoolYearDates(today) }
  })
  const [copySchedule, setCopySchedule] = useState(false)
  const [participation, setParticipation] = useState({}) // studentId -> 'continued' | 'departed'
  const [goalDecisions, setGoalDecisions] = useState({}) // goalId -> { decision, newGoalTitle }

  const [fieldError, setFieldError] = useState(null) // { field, message, goalId? } — ένα τη φορά
  const [submitError, setSubmitError] = useState(null)
  const [saving, setSaving] = useState(false)
  // Ref εκτός από state — ίδιο idiom με GoalWizardForm/GoalStatusModal: το setState δεν εφαρμόζεται
  // συγχρονισμένα, ένα γρήγορο διπλό tap θα διάβαζε δύο φορές saving=false στο ίδιο tick.
  const savingRef = useRef(false)
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [done, setDone] = useState(false)

  const labelRef = useRef(null)
  const startDateRef = useRef(null)
  const stepHeadingRef = useRef(null)
  const goalsErrorRef = useRef(null)
  const newGoalTitleRefs = useRef({})

  const students = useLiveQuery(() => db.students.orderBy('code').toArray(), [])
  const allGoals = useLiveQuery(() => db.goals.toArray(), [])
  const existingSchoolYears = useLiveQuery(() => db.schoolYears.toArray(), [])

  const activeStudents = (students || []).filter((s) => s.active)
  const activeStudentIds = new Set(activeStudents.map((s) => s.id))
  const liveGoals = (allGoals || []).filter((g) => LIVE_STATUSES.includes(g.status) && activeStudentIds.has(g.studentId))

  // Προεπιλογές — κάθε ενεργός μαθητής «συνεχίζει» εκτός αν σημειωθεί ρητά ως αποχωρών (σημεία 5/6).
  // Γεμίζει ΜΟΝΟ τα κλειδιά που λείπουν ακόμα, ποτέ ξαναγράφει ήδη υπάρχουσα (πιθανώς αλλαγμένη)
  // επιλογή — έτσι δεν χάνεται καμία επιλογή του χρήστη σε ενδιάμεσο re-render.
  useEffect(() => {
    if (!students) return
    setParticipation((prev) => {
      let changed = false
      const next = { ...prev }
      for (const s of activeStudents) {
        if (!(s.id in next)) { next[s.id] = 'continued'; changed = true }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students])

  useEffect(() => {
    if (!allGoals || !students) return
    setGoalDecisions((prev) => {
      let changed = false
      const next = { ...prev }
      for (const g of liveGoals) {
        if (!(g.id in next)) { next[g.id] = { decision: 'continue' }; changed = true }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allGoals, students])

  // Focus στο πρώτο heading κάθε βήματος (σημείο 11) — ίδιο idiom με GoalWizardForm, εδώ σε
  // επίπεδο βήματος αντί για επίπεδο πεδίου, αφού κάθε βήμα έχει διαφορετικό σχήμα περιεχομένου.
  useEffect(() => {
    stepHeadingRef.current?.focus()
  }, [step])

  useEffect(() => {
    if (done) stepHeadingRef.current?.focus()
  }, [done])

  useEffect(() => {
    if (fieldError?.field === 'goalsStep') goalsErrorRef.current?.focus()
  }, [fieldError])

  function markDirty() {
    if (!dirty) setDirty(true)
  }

  function updateYearField(field, value) {
    setYearFields((prev) => ({ ...prev, [field]: value }))
    setFieldError(null)
    markDirty()
  }

  function setStudentParticipation(studentId, status) {
    setParticipation((prev) => ({ ...prev, [studentId]: status }))
    markDirty()
  }

  // Όταν η απόφαση γίνει 'newGoal', ξεκινάει ΠΑΝΤΑ με κενό newGoalTitle (ρητά '' — ΟΧΙ ο τίτλος
  // του παλιού στόχου) — δύο λόγοι: (1) το πεδίο πρέπει να δείχνει ΑΚΡΙΒΩΣ ό,τι υπάρχει στο state,
  // αλλιώς ένα οπτικά «γεμάτο» πεδίο (π.χ. fallback στον παλιό τίτλο) θα έμοιαζε έγκυρο ενώ το
  // validateGoalsStep θα το θεωρούσε ακόμα κενό· (2) σκόπιμη επιλογή σχεδίασης — μια κενή, ρητά
  // απαιτούμενη εισαγωγή τονίζει ότι αυτό ΔΕΝ είναι απλή αντιγραφή χωρίς συνέπειες (σημείο 4).
  function setGoalDecision(goalId, decision) {
    setGoalDecisions((prev) => ({
      ...prev,
      [goalId]: { ...prev[goalId], decision, newGoalTitle: decision === 'newGoal' ? (prev[goalId]?.newGoalTitle || '') : prev[goalId]?.newGoalTitle }
    }))
    markDirty()
  }

  function setGoalNewTitle(goalId, title) {
    setGoalDecisions((prev) => ({ ...prev, [goalId]: { ...prev[goalId], newGoalTitle: title } }))
    markDirty()
  }

  function validateYearStep() {
    if (!yearFields.label.trim()) {
      return { field: 'label', message: 'Ο τίτλος είναι υποχρεωτικός.', ref: labelRef }
    }
    if (!yearFields.startDate || !yearFields.endDate) {
      return { field: 'startDate', message: 'Χρειάζονται και οι δύο ημερομηνίες.', ref: startDateRef }
    }
    if (yearFields.startDate > yearFields.endDate) {
      return { field: 'startDate', message: 'Η ημερομηνία έναρξης δεν μπορεί να είναι μετά τη λήξη.', ref: startDateRef }
    }
    const duplicate = (existingSchoolYears || []).some((y) => y.label === yearFields.label.trim())
    if (duplicate) {
      return { field: 'label', message: 'Υπάρχει ήδη σχολικό έτος με αυτόν τον τίτλο.', ref: labelRef }
    }
    return null
  }

  // Επιστρέφει το ΠΡΩΤΟ άκυρο "Νέος στόχος από αυτόν" χωρίς τίτλο (ίδιο idiom «ένα λάθος τη φορά»
  // με το GoalWizardForm) — goals αποχωρούντων μαθητών εξαιρούνται, δεν χρειάζονται απόφαση.
  function validateGoalsStep() {
    for (const g of liveGoals) {
      if (participation[g.studentId] === 'departed') continue
      const entry = goalDecisions[g.id]
      if (entry?.decision === 'newGoal' && !entry.newGoalTitle?.trim()) {
        return {
          field: 'goalsStep',
          goalId: g.id,
          message: `Ο νέος στόχος (αντί για «${g.title}») χρειάζεται τίτλο.`
        }
      }
    }
    return null
  }

  function focusValidationError(error) {
    if (error.ref) {
      error.ref.current?.focus()
    } else if (error.goalId != null) {
      newGoalTitleRefs.current[error.goalId]?.focus()
    }
  }

  function goNext() {
    if (step === 0) {
      const error = validateYearStep()
      if (error) { setFieldError(error); focusValidationError(error); return }
    }
    if (step === 2) {
      const error = validateGoalsStep()
      if (error) { setFieldError(error); return }
    }
    setFieldError(null)
    setStep((s) => s + 1)
  }

  function goBack() {
    setFieldError(null)
    setStep((s) => s - 1)
  }

  function requestLeave() {
    if (dirty) {
      setConfirmDiscardOpen(true)
    } else {
      navigate('/settings')
    }
  }

  const summary = summarizeTransition(activeStudents, liveGoals, participation, goalDecisions)

  async function handleSubmit() {
    if (savingRef.current) return

    const yearError = validateYearStep()
    if (yearError) { setStep(0); setFieldError(yearError); return }
    const goalsError = validateGoalsStep()
    if (goalsError) { setStep(2); setFieldError(goalsError); return }

    savingRef.current = true
    setSaving(true)
    setSubmitError(null)
    try {
      await applySchoolYearTransition(
        { label: yearFields.label.trim(), startDate: yearFields.startDate, endDate: yearFields.endDate },
        {
          goalDecisions: buildGoalDecisions(liveGoals, goalDecisions, participation, yearFields.startDate),
          participationDecisions: buildParticipationDecisions(participation),
          copySchedule
        }
      )
      // Το wizard «κλείνει» (μεταβαίνει στην κατάσταση done) ΜΟΝΟ εδώ, μετά από επιτυχή await —
      // καμία αισιόδοξη εμφάνιση επιτυχίας πριν ολοκληρωθεί η ατομική συναλλαγή (σημείο 9).
      setDone(true)
    } catch (err) {
      // Σε αποτυχία το wizard ΜΕΝΕΙ ανοιχτό, στο ΙΔΙΟ βήμα (review), με όλες τις επιλογές ανέπαφες —
      // το applySchoolYearTransition έκανε πλήρες rollback, τίποτα δεν γράφτηκε (σημείο 9).
      setSubmitError(err?.message || 'Η μετάβαση απέτυχε. Δοκίμασε ξανά — καμία από τις επιλογές σου δεν χάθηκε.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (students === undefined || allGoals === undefined) {
    return (
      <AppShell>
        <p>Φόρτωση…</p>
      </AppShell>
    )
  }

  if (done) {
    return (
      <AppShell>
        <Card className="year-transition-wizard__done-card">
          <h1 ref={stepHeadingRef} tabIndex={-1}>Η μετάβαση ολοκληρώθηκε</h1>
          <p>Το σχολικό έτος «{yearFields.label.trim()}» είναι πλέον το ενεργό έτος.</p>
          <Button variant="primary" onClick={() => navigate('/settings')}>Επιστροφή στις ρυθμίσεις</Button>
        </Card>
      </AppShell>
    )
  }

  const isLastStep = step === STEPS.length - 1
  const goalsStepGeneralError = fieldError?.field === 'goalsStep' ? fieldError.message : null

  return (
    <AppShell>
      <PageHeader
        title="Μετάβαση σε νέο σχολικό έτος"
        back={{ label: 'Πίσω', onClick: requestLeave, disabled: saving }}
      />

      {submitError && (
        <AlertBanner variant="danger" icon={AlertTriangle} className="year-transition-wizard__alert">
          {submitError}
        </AlertBanner>
      )}

      <nav className="year-transition-wizard__steps" aria-label="Βήματα μετάβασης σχολικού έτους">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`year-transition-wizard__step ${i === step ? 'year-transition-wizard__step--current' : ''} ${i < step ? 'year-transition-wizard__step--done' : ''}`}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="year-transition-wizard__step-number" aria-hidden="true">{i < step ? '✓' : i + 1}</span>
            <span className="year-transition-wizard__step-label">{s.label}</span>
          </div>
        ))}
      </nav>
      <p className="year-transition-wizard__step-mobile">Βήμα {step + 1} από {STEPS.length}: {STEPS[step].label}</p>

      <Card className="year-transition-wizard__card">
        {step === 0 && (
          <>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="year-transition-wizard__step-heading">Νέο σχολικό έτος</h2>

            <FormField htmlFor="yearLabel" label="Τίτλος" required error={fieldError?.field === 'label' ? fieldError.message : null}>
              <Input
                ref={labelRef}
                id="yearLabel"
                type="text"
                value={yearFields.label}
                onChange={(e) => updateYearField('label', e.target.value)}
                error={fieldError?.field === 'label'}
              />
            </FormField>

            <FormField htmlFor="yearStartDate" label="Ημερομηνία έναρξης" required error={fieldError?.field === 'startDate' ? fieldError.message : null}>
              <Input
                ref={startDateRef}
                id="yearStartDate"
                type="date"
                value={yearFields.startDate}
                onChange={(e) => updateYearField('startDate', e.target.value)}
                error={fieldError?.field === 'startDate'}
              />
            </FormField>

            <FormField htmlFor="yearEndDate" label="Ημερομηνία λήξης" required>
              <Input
                id="yearEndDate"
                type="date"
                value={yearFields.endDate}
                onChange={(e) => updateYearField('endDate', e.target.value)}
              />
            </FormField>

            <ToggleRow checked={copySchedule} onChange={(v) => { setCopySchedule(v); markDirty() }}>
              Ανανέωση προγράμματος για το νέο έτος (προαιρετικό)
            </ToggleRow>
            <p className="hint-text">
              Οι τρέχουσες εβδομαδιαίες αναθέσεις προγράμματος θα κλείσουν στο τέλος του τρέχοντος έτους και θα ανοίξουν ξανά, φρέσκιες, από την ημερομηνία έναρξης του νέου έτους — χωρίς τους μαθητές που αποχωρούν.
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="year-transition-wizard__step-heading">Μαθητές</h2>
            {activeStudents.length === 0 && <p>Δεν υπάρχουν ενεργοί μαθητές.</p>}
            <ul className="year-transition-wizard__student-list">
              {activeStudents.map((s) => (
                <li key={s.id} className="year-transition-wizard__student-row">
                  <span className="year-transition-wizard__student-name">{s.code}{s.nickname ? ` — ${s.nickname}` : ''}</span>
                  <ToggleRow
                    checked={participation[s.id] === 'departed'}
                    onChange={(checked) => setStudentParticipation(s.id, checked ? 'departed' : 'continued')}
                  >
                    Αποχωρεί
                  </ToggleRow>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 2 && (
          <>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="year-transition-wizard__step-heading">Στόχοι</h2>
            {goalsStepGeneralError && (
              <p ref={goalsErrorRef} tabIndex={-1} className="year-transition-wizard__error" role="alert">{goalsStepGeneralError}</p>
            )}
            {liveGoals.filter((g) => participation[g.studentId] !== 'departed').length === 0 && (
              <p>Κανένας στόχος χρειάζεται απόφαση.</p>
            )}
            {activeStudents.filter((s) => participation[s.id] !== 'departed').map((s) => {
              const studentGoals = liveGoals.filter((g) => g.studentId === s.id)
              if (studentGoals.length === 0) return null
              return (
                <div key={s.id} className="year-transition-wizard__goal-group">
                  <h3 className="year-transition-wizard__goal-group-title">{s.code}{s.nickname ? ` — ${s.nickname}` : ''}</h3>
                  {studentGoals.map((g) => {
                    const entry = goalDecisions[g.id] || { decision: 'continue' }
                    const titleHasError = fieldError?.field === 'goalsStep' && fieldError.goalId === g.id
                    return (
                      <div key={g.id} className="year-transition-wizard__goal-row">
                        <p className="year-transition-wizard__goal-title">
                          {g.title} <span className="year-transition-wizard__goal-domain">— {domainName(g.domain)} · {statusLabel(g.status)}</span>
                        </p>
                        <ChoiceGroup
                          name={`goal-${g.id}`}
                          value={entry.decision}
                          onChange={(v) => setGoalDecision(g.id, v)}
                          options={goalDecisionOptions(g)}
                          ariaLabel={`Απόφαση για τον στόχο ${g.title}`}
                        />
                        {entry.decision === 'newGoal' && (
                          <FormField
                            htmlFor={`newGoalTitle-${g.id}`}
                            label="Τίτλος νέου στόχου"
                            required
                            error={titleHasError ? fieldError.message : null}
                          >
                            <Input
                              ref={(el) => { newGoalTitleRefs.current[g.id] = el }}
                              id={`newGoalTitle-${g.id}`}
                              type="text"
                              placeholder={g.title}
                              value={entry.newGoalTitle || ''}
                              onChange={(e) => setGoalNewTitle(g.id, e.target.value)}
                              error={titleHasError}
                            />
                          </FormField>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </>
        )}

        {step === 3 && (
          <>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="year-transition-wizard__step-heading">Ανασκόπηση</h2>
            <ul className="year-transition-wizard__summary">
              <li><strong>Νέο σχολικό έτος:</strong> {yearFields.label.trim()} ({yearFields.startDate} έως {yearFields.endDate})</li>
              <li><strong>Μαθητές που συνεχίζουν:</strong> {summary.continuedCount}</li>
              <li><strong>Μαθητές που αποχωρούν:</strong> {summary.departedCount}</li>
              <li><strong>Στόχοι που συνεχίζονται:</strong> {summary.goalContinueCount}</li>
              <li><strong>Στόχοι που ολοκληρώνονται:</strong> {summary.goalAchievedCount}</li>
              <li><strong>Νέοι στόχοι (από υπάρχοντες):</strong> {summary.goalNewCount}</li>
              <li><strong>Ανανέωση προγράμματος:</strong> {copySchedule ? 'Ναι' : 'Όχι'}</li>
            </ul>
            <p className="hint-text">Η ενέργεια αυτή δεν αναιρείται. Έλεγξε τα παραπάνω πριν συνεχίσεις.</p>
          </>
        )}

        <div className="year-transition-wizard__actions">
          {step > 0 && (
            <Button variant="ghost" onClick={goBack} disabled={saving}>← Πίσω</Button>
          )}
          {!isLastStep && (
            <Button variant="primary" onClick={goNext}>Επόμενο →</Button>
          )}
          {isLastStep && (
            <Button variant="primary" loading={saving} onClick={handleSubmit}>Ολοκλήρωση μετάβασης</Button>
          )}
        </div>
      </Card>

      <Modal
        open={confirmDiscardOpen}
        onClose={() => setConfirmDiscardOpen(false)}
        title="Εγκατάλειψη μετάβασης;"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscardOpen(false)}>Συνέχεια</Button>
            <Button variant="danger" onClick={() => navigate('/settings')}>Απόρριψη επιλογών</Button>
          </>
        }
      >
        <p>Έχεις κάνει επιλογές σε αυτή τη μετάβαση. Αν φύγεις τώρα, καμία εγγραφή δεν έχει γίνει ακόμα στη βάση — αλλά οι επιλογές σου θα χαθούν.</p>
      </Modal>
    </AppShell>
  )
}
