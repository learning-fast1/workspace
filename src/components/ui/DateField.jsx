import { useEffect, useState } from 'react'
import { todayLocalISO, yesterdayLocalISO } from '../../utils/date.js'
import Button from './Button.jsx'
import './DateField.css'

// Σύνθετο πεδίο ημερομηνίας: native date picker + δύο quick-pick κουμπιά (Σήμερα/Χθες — το πιο
// συχνό σενάριο καταχώρησης συνεδρίας άλλης μέρας) + ξεχωριστό, πάντα προβλέψιμο πεδίο «Έτος».
//
// Λόγος ύπαρξης του ξεχωριστού πεδίου έτους: επιβεβαιώθηκε (χειροκίνητα, με πραγματικά κλικ) ότι
// το native date input, σε αρκετά browsers, έχει πολύ στενά/ασαφή "segments" δίπλα στο δικό του
// calendar-icon κουμπί — ένα κλικ «κοντά στο έτος» συχνά χτυπάει είτε λάθος segment (ημέρα/μήνας,
// αλλοιώνοντας αθόρυβα την τιμή) είτε το ίδιο το calendar-icon (ανοίγει dropdown όπου τα βελάκια
// μετακινούν κατά ΕΒΔΟΜΑΔΑ, όχι έτος — ακριβώς η αναφερόμενη δυσκολία «πρέπει να πατάω συνεχώς τα
// βελάκια»). Το ξεχωριστό πεδίο είναι ένα απλό `<input type="text">` σταθερού πλάτους: κλικ
// (auto-select όλου του περιεχομένου) → πληκτρολόγηση 4 ψηφίων → done, χωρίς καμία ασάφεια.
//
// value/onChange: raw ISO string (YYYY-MM-DD), όχι event object — ίδιο μοτίβο με το ToggleRow
// (συνθετικό/opinionated component, όχι λεπτό passthrough wrapper όπως το Input/Textarea/Select).
export default function DateField({ id, value, onChange }) {
  const [yearDraft, setYearDraft] = useState(value.slice(0, 4))

  // Συγχρονισμός όταν η τιμή αλλάζει απ' έξω (π.χ. πάτημα «Σήμερα»/«Χθες», ή αρχικό γέμισμα φόρμας).
  useEffect(() => {
    setYearDraft(value.slice(0, 4))
  }, [value])

  function handleNativeChange(e) {
    // Το native date input δίνει κενό string ενόσω η τιμή είναι ημιτελής/άκυρη — δεν το προωθούμε.
    if (e.target.value) onChange(e.target.value)
  }

  function handleYearChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
    setYearDraft(digits)
    if (digits.length === 4) onChange(`${digits}-${value.slice(5)}`)
  }

  function handleYearBlur() {
    // Ημιτελές πληκτρολόγημα στο blur (π.χ. έφυγε μετά από 2 ψηφία) — επαναφορά στην πραγματική τιμή.
    if (yearDraft.length !== 4) setYearDraft(value.slice(0, 4))
  }

  return (
    <div className="date-field">
      <div className="date-field__presets">
        <Button variant="secondary" onClick={() => onChange(todayLocalISO())}>Σήμερα</Button>
        <Button variant="secondary" onClick={() => onChange(yesterdayLocalISO())}>Χθες</Button>
      </div>
      <div className="date-field__row">
        <input
          id={id}
          type="date"
          className="input date-field__native"
          value={value}
          onChange={handleNativeChange}
        />
        <label className="date-field__year" htmlFor={`${id}-year`}>
          Έτος
          <input
            id={`${id}-year`}
            type="text"
            inputMode="numeric"
            maxLength={4}
            className="input date-field__year-input"
            value={yearDraft}
            onChange={handleYearChange}
            onFocus={(e) => e.target.select()}
            onBlur={handleYearBlur}
          />
        </label>
      </div>
    </div>
  )
}
