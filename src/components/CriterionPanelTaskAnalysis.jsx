import CriterionPanelListBased from './CriterionPanelListBased.jsx'

// Βήματα εργασίας — Technical Plan Στάδιο 7. Λεπτός wrapper γύρω από το κοινό CriterionPanelListBased.
export default function CriterionPanelTaskAnalysis({ criterionConfig, onChange, error }) {
  return (
    <CriterionPanelListBased
      criterionConfig={criterionConfig}
      onChange={onChange}
      error={error}
      itemsField="steps"
      measurementType="taskAnalysis"
      reorderable
      sectionLabel="Βήματα (με τη σειρά)"
      orderHint="Η σειρά των βημάτων έχει σημασία."
      addButtonLabel="Προσθήκη βήματος"
      itemLabelSingular="Βήμα"
      itemLabelGenitive="βήματος"
      targetLabel="Στόχος ολοκληρωμένων βημάτων"
    />
  )
}
