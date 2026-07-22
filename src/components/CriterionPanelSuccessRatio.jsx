import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import { generateCriterionText } from '../utils/measurementTypes/index.js'
import './CriterionPanelSuccessRatio.css'

// Ποσοστό επιτυχίας — Technical Plan Στάδιο 4. criterionConfig: { targetSuccesses, targetAttempts }.
// Inline μήνυμα ΚΑΘΩΣ πληκτρολογεί (εγκεκριμένη διόρθωση χρήστη #3) — ξεχωριστό από το
// validateCriterionConfig που μπλοκάρει «Επόμενο»/Αποθήκευση στο GoalWizardForm.jsx (μέσω του
// `error` prop, δικό του DoD item). ΔΕΝ εμποδίζει την πληκτρολόγηση — μόνο ενημερώνει άμεσα.
export default function CriterionPanelSuccessRatio({ criterionConfig, onChange, error }) {
  const targetSuccesses = criterionConfig?.targetSuccesses
  const targetAttempts = criterionConfig?.targetAttempts
  const bothFilled = Number.isFinite(targetSuccesses) && Number.isFinite(targetAttempts)

  const inlineError = bothFilled && targetSuccesses > targetAttempts
    ? 'Ο αριθμός επιτυχιών δεν μπορεί να είναι μεγαλύτερος από τον αριθμό προσπαθειών.'
    : null

  const preview = bothFilled && !inlineError && targetAttempts > 0
    ? generateCriterionText('successRatio', { targetSuccesses, targetAttempts })
    : null

  function updateField(field, raw) {
    const value = raw === '' ? null : Number(raw)
    onChange({
      targetSuccesses: criterionConfig?.targetSuccesses ?? null,
      targetAttempts: criterionConfig?.targetAttempts ?? null,
      [field]: value
    })
  }

  return (
    <div className="criterion-panel-success-ratio">
      <div className="criterion-panel-success-ratio__row">
        <FormField htmlFor="criterionTargetSuccesses" label="Επιτυχίες">
          <Input
            id="criterionTargetSuccesses"
            type="number"
            min="0"
            value={targetSuccesses ?? ''}
            onChange={(e) => updateField('targetSuccesses', e.target.value)}
            error={Boolean(inlineError)}
            aria-invalid={inlineError ? 'true' : undefined}
          />
        </FormField>
        <FormField htmlFor="criterionTargetAttempts" label="Σύνολο προσπαθειών">
          <Input
            id="criterionTargetAttempts"
            type="number"
            min="1"
            value={targetAttempts ?? ''}
            onChange={(e) => updateField('targetAttempts', e.target.value)}
            error={Boolean(inlineError)}
            aria-invalid={inlineError ? 'true' : undefined}
          />
        </FormField>
      </div>
      {(inlineError || error) && (
        <p className="criterion-panel-success-ratio__error" role="alert">{inlineError || error}</p>
      )}
      {preview && <p className="criterion-panel-success-ratio__preview">Κριτήριο: «{preview}»</p>}
    </div>
  )
}
