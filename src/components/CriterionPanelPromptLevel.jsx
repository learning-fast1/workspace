import FormField from './ui/FormField.jsx'
import ChoiceGroup from './ui/ChoiceGroup.jsx'
import { PROMPT_LEVELS } from '../config/promptLevels.js'

// Επίπεδο υποστήριξης — Technical Plan Στάδιο 4. criterionConfig: { targetLevel }.
// Χρησιμοποιεί το ήδη υπάρχον ui/ChoiceGroup.jsx (native radio inputs) αντί για το button-variant
// idiom του GoalRecorder.jsx — εγκεκριμένη διόρθωση χρήστη: ο εκπαιδευτικός ΕΠΙΛΕΓΕΙ κριτήριο
// ολοκλήρωσης εδώ, δεν εκτελεί ενέργεια καταγραφής· η σημασιολογία radio/selection το εκφράζει
// πιο ξεκάθαρα από ένα κουμπί με εναλλασσόμενο variant.
//
// Ορολογία: ΠΑΝΤΑ «υποστήριξη» (ποτέ «στήριξη») — ίδιος όρος με την κάρτα του τύπου (§3, «Επίπεδο
// υποστήριξης») και με το ξεχωριστό, ανεξάρτητο πεδίο «Τρέχουσα υποστήριξη» στις Άλλες λεπτομέρειες
// (διόρθωση χρήστη, Στάδιο 4 — ασυνέπεια ορολογίας «στήριξη» vs «υποστήριξη»).
export default function CriterionPanelPromptLevel({ criterionConfig, onChange, error }) {
  return (
    <FormField label="Επίπεδο υποστήριξης για ολοκλήρωση" required error={error}>
      <ChoiceGroup
        name="criterionTargetLevel"
        value={criterionConfig?.targetLevel ?? null}
        onChange={(value) => onChange({ targetLevel: value })}
        options={PROMPT_LEVELS}
        ariaLabel="Επίπεδο υποστήριξης για ολοκλήρωση"
      />
    </FormField>
  )
}
