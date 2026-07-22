import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import ChoiceGroup from './ui/ChoiceGroup.jsx'
import { computeCriterionPreview } from './criterionPanelPreview.js'
import './CriterionPanelRatingScale.css'

const LEVELS = [1, 2, 3, 4, 5]
const TARGET_OPTIONS = LEVELS.map((level) => ({ value: level, label: `Βαθμίδα ${level}` }))

function placeholderFor(level) {
  // Ουδέτερο, ΟΧΙ domain-specific παράδειγμα (διόρθωση χρήστη Σταδίου 6) — «συμμετοχή» θα μπέρδευε
  // σε Μαθηματικά/Γλώσσα/Αυτοεξυπηρέτηση. Domain-based προτάσεις θα εξεταστούν αργότερα, προαιρετικά.
  return `Τι σημαίνει η βαθμίδα ${level} για αυτόν τον στόχο;`
}

function levelLabel(level) {
  if (level === 1) return 'Βαθμίδα 1 (χαμηλότερη)'
  if (level === 5) return 'Βαθμίδα 5 (υψηλότερη)'
  return `Βαθμίδα ${level}`
}

// Κλίμακα 1–5 — Technical Plan Στάδιο 6, ΑΝΑΘΕΩΡΗΜΕΝΟ μετά το browser smoke test (Product Design
// §7 Β2). Validation ΚΑΙ παραγωγή κειμένου κριτηρίου παραμένουν αποκλειστικά στο framework-agnostic
// utils/measurementTypes/ratingScale.js — αυτό το component δεν αποφασίζει τίποτα μόνο του.
//
// ΔΥΟ ξεχωριστές ενότητες, ΟΧΙ ένα ενσωματωμένο radio ανά γραμμή περιγραφής (η αρχική σχεδίαση
// προκαλούσε σύγχυση: φαινόταν σαν να επιλέγεται η τρέχουσα επίδοση, όχι το κριτήριο ολοκλήρωσης):
//   1. Περιγραφή ΚΑΙ των 5 βαθμίδων — καμία επιλογή εδώ, μόνο κείμενο. 1 = χαμηλότερη επίδοση,
//      5 = υψηλότερη, δηλωμένο οπτικά στις ετικέτες των άκρων.
//   2. ΑΠΟ ΚΑΤΩ, ξεχωριστή ενότητα «Πότε θεωρείται ότι ολοκληρώνεται ο στόχος;» — ένα radiogroup
//      5 απλών επιλογών (εδώ ταιριάζει τέλεια το ήδη υπάρχον ui/ChoiceGroup.jsx, χωρίς customization).
// Η ροή αντιστοιχεί στο πώς σκέφτεται πραγματικά ο εκπαιδευτικός: πρώτα ορίζει ολόκληρη την
// κλίμακα, ΜΕΤΑ αποφασίζει ξεχωριστά ποια βαθμίδα μετράει ως ολοκλήρωση.
//
// Μελλοντικό, ΕΚΤΟΣ εμβέλειας τώρα (Product Design §9): ξεχωριστή ενέργεια «ολοκλήρωση στόχου» που
// θα καταγράφει σε ΠΟΙΑ βαθμίδα ολοκληρώθηκε τελικά ο στόχος (ίδια ή χαμηλότερη από το targetLevel
// εδώ) — δεν αγγίζει το criterionConfig, καμία υλοποίηση σε αυτό το component.
export default function CriterionPanelRatingScale({ criterionConfig, onChange, error }) {
  const targetLevel = criterionConfig?.targetLevel ?? null
  const levelDescriptions = criterionConfig?.levelDescriptions ?? { 1: '', 2: '', 3: '', 4: '', 5: '' }

  function updateDescription(level, text) {
    onChange({ targetLevel, levelDescriptions: { ...levelDescriptions, [level]: text } })
  }

  function selectTargetLevel(level) {
    onChange({ targetLevel: level, levelDescriptions })
  }

  const preview = computeCriterionPreview('ratingScale', { targetLevel, levelDescriptions })

  return (
    <div className="criterion-panel-rating-scale">
      <p className="criterion-panel-rating-scale__intro">
        Περιγράψτε τι σημαίνει κάθε βαθμίδα για αυτόν τον στόχο (1 = χαμηλότερη επίδοση, 5 = υψηλότερη).
      </p>
      <div className="criterion-panel-rating-scale__rows">
        {LEVELS.map((level) => (
          <div key={level} className="criterion-panel-rating-scale__row">
            <span className="criterion-panel-rating-scale__level-number" aria-hidden="true">{level}</span>
            <FormField htmlFor={`criterionRatingScaleDesc-${level}`} label={levelLabel(level)}>
              <Input
                id={`criterionRatingScaleDesc-${level}`}
                type="text"
                placeholder={placeholderFor(level)}
                value={levelDescriptions[level] || ''}
                onChange={(e) => updateDescription(level, e.target.value)}
              />
            </FormField>
          </div>
        ))}
      </div>

      <div className="criterion-panel-rating-scale__target">
        <FormField label="Πότε θεωρείται ότι ολοκληρώνεται ο στόχος;" required>
          <ChoiceGroup
            name="criterionRatingScaleTarget"
            value={targetLevel}
            onChange={selectTargetLevel}
            options={TARGET_OPTIONS}
            ariaLabel="Πότε θεωρείται ότι ολοκληρώνεται ο στόχος;"
          />
        </FormField>
      </div>

      {error && <p className="criterion-panel-rating-scale__error" role="alert">{error}</p>}
      {preview && <p className="criterion-panel-rating-scale__preview">Κριτήριο: «{preview}»</p>}
    </div>
  )
}
