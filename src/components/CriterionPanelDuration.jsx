import CriterionPanelDirectional from './CriterionPanelDirectional.jsx'

// Διάρκεια — Technical Plan Στάδιο 5. Λεπτός wrapper γύρω από το κοινό CriterionPanelDirectional.
export default function CriterionPanelDuration({ criterionConfig, onChange, error }) {
  return (
    <CriterionPanelDirectional
      criterionConfig={criterionConfig}
      onChange={onChange}
      error={error}
      measurementType="duration"
      targetField="targetMinutes"
      targetLabel="Στόχος λεπτών"
    />
  )
}
