import { useEffect, useRef, useState } from 'react'
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import Input from './Input.jsx'
import Button from './Button.jsx'
import './ListBuilder.css'

let idCounter = 0
// Καμία εξάρτηση σε Web Crypto API (crypto.randomUUID) — απλός, πάντα διαθέσιμος generator.
// Μοναδικότητα εντός ΕΝΟΣ στόχου/μιας λίστας αρκεί (Technical Plan Στάδιο 7) — όχι κρυπτογραφική.
function generateId() {
  idCounter += 1
  return `${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`
}

// Γενικό, επαναχρησιμοποιήσιμο add/remove/(προαιρετικά) reorder για λίστες γραμμών κειμένου
// (Technical Plan Στάδιο 7) — καμία γνώση για criterionConfig/measurementType, καθαρά UI. Reorder
// μέσω πάντα-ορατών ▲/▼ κουμπιών με `disabled` στα άκρα (όχι εξαφάνιση, όχι drag-and-drop — ήδη
// εγκεκριμένη απόφαση, ίδια ΛΟΓΙΚΗ index/direction με το TodayQueue.jsx handleMove, νέα ΟΠΤΙΚΗ).
//
// itemLabelSingular (π.χ. «Βήμα»): ονομαστική, για το aria-label του πεδίου κειμένου.
// itemLabelGenitive (π.χ. «βήματος»): γενική, για τα aria-labels των ενεργειών
// («Μετακίνηση βήματος 2 προς τα πάνω», «Αφαίρεση βήματος 2» — διόρθωση χρήστη #4).
export default function ListBuilder({
  items,
  onChange,
  reorderable = false,
  addButtonLabel,
  itemLabelSingular,
  itemLabelGenitive,
  error
}) {
  const [focusId, setFocusId] = useState(null)
  const inputRefs = useRef({})

  // Νέα γραμμή παίρνει focus αυτόματα (εγκεκριμένη απόφαση) — τρέχει ΜΕΤΑ το commit, όταν το DOM
  // node της νέας γραμμής σίγουρα υπάρχει.
  useEffect(() => {
    if (focusId != null && inputRefs.current[focusId]) {
      inputRefs.current[focusId].focus()
      setFocusId(null)
    }
  }, [focusId, items])

  function addItem() {
    const id = generateId()
    onChange([...items, { id, label: '' }])
    setFocusId(id)
  }

  function updateLabel(id, label) {
    onChange(items.map((it) => (it.id === id ? { ...it, label } : it)))
  }

  function removeItem(id) {
    onChange(items.filter((it) => it.id !== id))
  }

  // Καθαρή local array swap — καμία επαφή με τη βάση εδώ (η σειρά αποθηκεύεται ΜΟΝΟ στο τελικό
  // submit του wizard, ίδιο idiom με όλα τα υπόλοιπα criterionConfig panels).
  function moveItem(index, direction) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= items.length) return
    const next = items.slice()
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    onChange(next)
  }

  return (
    <div className="list-builder">
      {items.map((item, index) => (
        <div key={item.id} className="list-builder__row">
          {reorderable && (
            <div className="list-builder__reorder">
              <button
                type="button"
                className="list-builder__icon-btn"
                aria-label={`Μετακίνηση ${itemLabelGenitive} ${index + 1} προς τα πάνω`}
                disabled={index === 0}
                onClick={() => moveItem(index, -1)}
              >
                <ChevronUp size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="list-builder__icon-btn"
                aria-label={`Μετακίνηση ${itemLabelGenitive} ${index + 1} προς τα κάτω`}
                disabled={index === items.length - 1}
                onClick={() => moveItem(index, 1)}
              >
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <Input
            ref={(el) => { inputRefs.current[item.id] = el }}
            type="text"
            aria-label={`${itemLabelSingular} ${index + 1}`}
            value={item.label}
            onChange={(e) => updateLabel(item.id, e.target.value)}
            className="list-builder__input"
          />
          <button
            type="button"
            className="list-builder__icon-btn list-builder__icon-btn--remove"
            aria-label={`Αφαίρεση ${itemLabelGenitive} ${index + 1}`}
            onClick={() => removeItem(item.id)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      <Button variant="ghost" icon={Plus} onClick={addItem} className="list-builder__add-btn">
        {addButtonLabel}
      </Button>
      {error && <p className="list-builder__error" role="alert">{error}</p>}
    </div>
  )
}
