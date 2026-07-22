import CriterionPanelSuccessRatio from './CriterionPanelSuccessRatio.jsx'
import CriterionPanelPromptLevel from './CriterionPanelPromptLevel.jsx'
import CriterionPanelNarrative from './CriterionPanelNarrative.jsx'
import CriterionPanelDuration from './CriterionPanelDuration.jsx'
import CriterionPanelFrequency from './CriterionPanelFrequency.jsx'
import CriterionPanelRatingScale from './CriterionPanelRatingScale.jsx'
import CriterionPanelTaskAnalysis from './CriterionPanelTaskAnalysis.jsx'
import CriterionPanelChecklist from './CriterionPanelChecklist.jsx'

// UI-layer registry (Technical Plan Στάδιο 4) — παράλληλο, ΟΧΙ μέρος του utils/measurementTypes/
// (εκείνο είναι σκόπιμα framework-agnostic, τεσταρισμένο χωρίς jsdom· εδώ μπαίνει JSX). Κάθε
// panel: { criterionConfig, onChange(newConfig), error }. Και οι 8 τύποι έχουν πλέον δικό τους
// panel (Στάδιο 7 ολοκλήρωσε τη λίστα) — μηδέν αλλαγή στο GoalWizardForm.jsx σε ΚΑΝΕΝΑ από τα
// Στάδια 5-7, μόνο νέες εγγραφές εδώ κάθε φορά.
const CRITERION_PANELS = {
  successRatio: CriterionPanelSuccessRatio,
  promptLevel: CriterionPanelPromptLevel,
  narrative: CriterionPanelNarrative,
  duration: CriterionPanelDuration,
  frequency: CriterionPanelFrequency,
  ratingScale: CriterionPanelRatingScale,
  taskAnalysis: CriterionPanelTaskAnalysis,
  checklist: CriterionPanelChecklist
}

// Πλέον πάντα βρίσκει module (και οι 8 τύποι καλυμμένοι) — το null παραμένει ως defensive fallback.
export function getCriterionPanel(measurementType) {
  return CRITERION_PANELS[measurementType] || null
}
