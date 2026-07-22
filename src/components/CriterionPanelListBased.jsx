import { useState } from 'react'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import ListBuilder from './ui/ListBuilder.jsx'
import { computeCriterionPreview } from './criterionPanelPreview.js'
import './CriterionPanelListBased.css'

// Κοινό, config-driven panel για Checklist/Βήματα εργασίας (Technical Plan Στάδιο 7). Validation
// ΚΑΙ παραγωγή κειμένου κριτηρίου παραμένουν αποκλειστικά στα framework-agnostic
// utils/measurementTypes/{taskAnalysis,checklist}.js — αυτό το component δεν αποφασίζει τίποτα
// μόνο του εκτός από τον κανόνα targetCompletedCount παρακάτω (καθαρά UI-level, δεν αγγίζει
// validation/criterion text).
//
// targetCompletedCount — auto/manual κανόνας (εγκεκριμένη διόρθωση χρήστη #1):
//   - Όσο ο εκπαιδευτικός ΔΕΝ έχει επεξεργαστεί ρητά το πεδίο, ακολουθεί αυτόματα το μήκος της
//     λίστας (κάθε προσθήκη/αφαίρεση το ενημερώνει).
//   - Μόλις το επεξεργαστεί ρητά (onChange του πεδίου target), περνά ΜΟΝΙΜΑ σε manual mode γι' αυτή
//     τη σύνοδο επεξεργασίας — επόμενες προσθήκες ΔΕΝ το αυξάνουν πια αυτόματα.
//   - Η αφαίρεση στοιχείων κάνει ΠΑΝΤΑ clamp προς τα κάτω αν η τιμή υπερβαίνει το νέο μήκος,
//     ανεξάρτητα από manual/auto.
//   - Σε edit mode υπάρχοντος δομημένου στόχου (criterionConfig ήδη έχει targetCompletedCount στο
//     mount), ξεκινά ΚΑΤΕΥΘΕΙΑΝ σε manual mode — δεν αλλάζει σιωπηλά επειδή προστίθεται στοιχείο.
// Το manual flag είναι ΑΠΟΚΛΕΙΣΤΙΚΑ προσωρινό React state αυτού του component — ΔΕΝ αποθηκεύεται
// στη βάση, ΔΕΝ υπάρχει στο criterionConfig schema.
export default function CriterionPanelListBased({
  criterionConfig,
  onChange,
  error,
  itemsField,
  measurementType,
  reorderable,
  sectionLabel,
  orderHint,
  addButtonLabel,
  itemLabelSingular,
  itemLabelGenitive,
  targetLabel
}) {
  const items = criterionConfig?.[itemsField] ?? []
  const targetCompletedCount = criterionConfig?.targetCompletedCount ?? null

  const [manual, setManual] = useState(() => targetCompletedCount != null)

  function commit(nextItems, nextTarget) {
    onChange({ [itemsField]: nextItems, targetCompletedCount: nextTarget })
  }

  function handleItemsChange(nextItems) {
    const length = nextItems.length
    let nextTarget = targetCompletedCount
    if (!manual) {
      nextTarget = length > 0 ? length : null
    } else if (nextTarget != null && nextTarget > length) {
      nextTarget = length > 0 ? length : null
    }
    commit(nextItems, nextTarget)
  }

  function handleTargetChange(raw) {
    setManual(true)
    commit(items, raw === '' ? null : Number(raw))
  }

  const preview = computeCriterionPreview(measurementType, { [itemsField]: items, targetCompletedCount })

  return (
    <div className="criterion-panel-list-based">
      <FormField label={sectionLabel}>
        <p className="criterion-panel-list-based__hint">{orderHint}</p>
        <ListBuilder
          items={items}
          onChange={handleItemsChange}
          reorderable={reorderable}
          addButtonLabel={addButtonLabel}
          itemLabelSingular={itemLabelSingular}
          itemLabelGenitive={itemLabelGenitive}
        />
      </FormField>

      <FormField htmlFor={`criterionTarget-${measurementType}`} label={targetLabel}>
        <Input
          id={`criterionTarget-${measurementType}`}
          type="number"
          min="1"
          max={items.length || undefined}
          value={targetCompletedCount ?? ''}
          onChange={(e) => handleTargetChange(e.target.value)}
        />
      </FormField>

      {error && <p className="criterion-panel-list-based__error" role="alert">{error}</p>}
      {preview && <p className="criterion-panel-list-based__preview">Κριτήριο: «{preview}»</p>}
    </div>
  )
}
