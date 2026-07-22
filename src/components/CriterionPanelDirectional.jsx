import FormField from './ui/FormField.jsx'
import ChoiceGroup from './ui/ChoiceGroup.jsx'
import Input from './ui/Input.jsx'
import { computeCriterionPreview } from './criterionPanelPreview.js'
import './CriterionPanelDirectional.css'

const DIRECTION_OPTIONS = [
  { value: 'increase', label: 'Να αυξηθεί' },
  { value: 'decrease', label: 'Να μειωθεί' }
]

// Κοινό, καθαρά presentational/config-driven panel για Διάρκεια/Συχνότητα (Technical Plan Στάδιο
// 5) — ίδιο σχήμα UI (κατεύθυνση + αριθμητικός στόχος + προαιρετικό πλαίσιο), διαφέρουν μόνο σε
// μονάδα/ετικέτα (βλ. CriterionPanelDuration.jsx/CriterionPanelFrequency.jsx). Validation ΚΑΙ
// παραγωγή κειμένου κριτηρίου ΠΑΡΑΜΕΝΟΥΝ αποκλειστικά στα framework-agnostic
// utils/measurementTypes/{duration,frequency}.js — αυτό το component δεν αναπαράγει δικό του
// κανόνα εγκυρότητας πουθενά, ούτε καν για τη ζωντανή προεπισκόπηση (βλ. criterionPanelPreview.js,
// κοινό με το CriterionPanelRatingScale.jsx του Σταδίου 6: η προεπισκόπηση εμφανίζεται ΜΟΝΟ όταν
// το ίδιο το validateCriterionConfig του module θα το δεχόταν).
//
// Ίδια λύση με το Prompt Level (Στάδιο 4): ChoiceGroup (native radiogroup) για την κατεύθυνση,
// όχι κουμπιά — επιλογή κριτηρίου, όχι ενέργεια.
export default function CriterionPanelDirectional({ criterionConfig, onChange, error, measurementType, targetField, targetLabel }) {
  const direction = criterionConfig?.direction ?? null
  const targetValue = criterionConfig?.[targetField] ?? null
  const context = criterionConfig?.context ?? ''

  const preview = computeCriterionPreview(measurementType, { direction, [targetField]: targetValue, context })

  function update(patch) {
    onChange({ direction, [targetField]: targetValue, context, ...patch })
  }

  return (
    <div className="criterion-panel-directional">
      <FormField label="Πώς θέλεις να αλλάξει;" required>
        <ChoiceGroup
          name={`criterionDirection-${measurementType}`}
          value={direction}
          onChange={(value) => update({ direction: value })}
          options={DIRECTION_OPTIONS}
          ariaLabel="Πώς θέλεις να αλλάξει;"
        />
      </FormField>
      <FormField htmlFor={`criterionTarget-${measurementType}`} label={targetLabel}>
        <Input
          id={`criterionTarget-${measurementType}`}
          type="number"
          min="0"
          value={targetValue ?? ''}
          onChange={(e) => update({ [targetField]: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </FormField>
      <FormField htmlFor={`criterionContext-${measurementType}`} label="Πλαίσιο (προαιρετικό)">
        <Input
          id={`criterionContext-${measurementType}`}
          type="text"
          placeholder="π.χ. ανά συνεδρία"
          value={context}
          onChange={(e) => update({ context: e.target.value })}
        />
      </FormField>
      {error && <p className="criterion-panel-directional__error" role="alert">{error}</p>}
      {preview && <p className="criterion-panel-directional__preview">Κριτήριο: «{preview}»</p>}
    </div>
  )
}
