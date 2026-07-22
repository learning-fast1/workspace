import FormField from './ui/FormField.jsx'
import Textarea from './ui/Textarea.jsx'

// Περιγραφική παρατήρηση — Technical Plan Στάδιο 4. criterionConfig: { successDescription }.
// Η ετικέτα εκφράζει το κριτήριο ολοκλήρωσης («πότε θεωρείται επιτυχία»), όχι το εσωτερικό
// τεχνικό όνομα του πεδίου (εγκεκριμένη διόρθωση χρήστη).
export default function CriterionPanelNarrative({ criterionConfig, onChange, error }) {
  return (
    <FormField
      htmlFor="criterionSuccessDescription"
      label="Πότε θεωρείται ότι ο στόχος έχει επιτευχθεί;"
      required
      error={error}
    >
      <Textarea
        id="criterionSuccessDescription"
        value={criterionConfig?.successDescription ?? ''}
        onChange={(e) => onChange({ successDescription: e.target.value })}
        placeholder="π.χ. Ο μαθητής περιγράφει προφορικά τα βήματα μιας δραστηριότητας καθημερινής ζωής χωρίς υπενθύμιση."
        error={!!error}
        aria-invalid={error ? 'true' : undefined}
      />
    </FormField>
  )
}
