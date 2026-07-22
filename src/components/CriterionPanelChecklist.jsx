import CriterionPanelListBased from './CriterionPanelListBased.jsx'

// Checklist — Technical Plan Στάδιο 7. Λεπτός wrapper γύρω από το κοινό CriterionPanelListBased.
export default function CriterionPanelChecklist({ criterionConfig, onChange, error }) {
  return (
    <CriterionPanelListBased
      criterionConfig={criterionConfig}
      onChange={onChange}
      error={error}
      itemsField="items"
      measurementType="checklist"
      reorderable={false}
      sectionLabel="Στοιχεία"
      orderHint="Τα στοιχεία μπορούν να ολοκληρώνονται με οποιαδήποτε σειρά."
      addButtonLabel="Προσθήκη στοιχείου"
      itemLabelSingular="Στοιχείο"
      itemLabelGenitive="στοιχείου"
      targetLabel="Στόχος ολοκληρωμένων στοιχείων"
    />
  )
}
