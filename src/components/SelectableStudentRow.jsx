import Card from './ui/Card.jsx'
import './SelectableStudentRow.css'

// Καθαρά presentational — καμία query. Χρησιμοποιείται και στις δύο οθόνες επιλογής μαθητή/ών πριν
// το Teaching Mode. `mode`: 'single' (radio, ένας μαθητής — Ατομικό) ή 'multiple' (checkbox, πολλοί
// μαθητές — Ομαδικό). Native input μέσα σε <label> (ίδιο μοτίβο με το ui/ToggleRow) — καμία ανάγκη
// για custom-σχεδιασμένο indicator, ο browser δίνει ήδη σωστή προσβασιμότητα/ομαδοποίηση.
//
// `disabled`/`statusLabel` (Sprint 6, δεύτερος γύρος διορθώσεων) — προαιρετικά, ΧΩΡΙΣ default τιμή
// άρα καμία επίδραση σε υπάρχουσες χρήσεις (SelectIndividualStudent/SelectGroupStudents) που δεν τα
// περνάνε. Χρησιμοποιούνται από το AddIndividualToToday/AddGroupToToday για να αποτρέψουν σιωπηλά
// διπλότυπα — μαθητής που έχει ήδη σημερινή εμφάνιση εμφανίζεται disabled με εξήγηση γιατί.
export default function SelectableStudentRow({ code, nickname, selected, onSelect, mode = 'single', name, disabled, statusLabel }) {
  return (
    <Card
      as="label"
      variant={disabled ? 'default' : 'interactive'}
      className={`selectable-student-row ${selected ? 'selectable-student-row--selected' : ''} ${disabled ? 'selectable-student-row--disabled' : ''}`}
    >
      <input
        type={mode === 'multiple' ? 'checkbox' : 'radio'}
        name={name}
        className="selectable-student-row__input"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="selectable-student-row__code">{code}</span>
      {nickname && <span className="selectable-student-row__nickname">{nickname}</span>}
      {statusLabel && <span className="selectable-student-row__status">{statusLabel}</span>}
    </Card>
  )
}
