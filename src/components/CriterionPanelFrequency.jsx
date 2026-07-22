import CriterionPanelDirectional from './CriterionPanelDirectional.jsx'

// Συχνότητα — Technical Plan Στάδιο 5. Λεπτός wrapper γύρω από το κοινό CriterionPanelDirectional.
export default function CriterionPanelFrequency({ criterionConfig, onChange, error }) {
  return (
    <CriterionPanelDirectional
      criterionConfig={criterionConfig}
      onChange={onChange}
      error={error}
      measurementType="frequency"
      targetField="targetCount"
      targetLabel="Στόχος φορών"
    />
  )
}
