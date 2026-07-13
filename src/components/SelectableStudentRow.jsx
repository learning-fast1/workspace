import Card from './ui/Card.jsx'
import './SelectableStudentRow.css'

// Καθαρά presentational — καμία query. Χρησιμοποιείται και στις δύο οθόνες επιλογής μαθητή/ών πριν
// το Teaching Mode. `mode`: 'single' (radio, ένας μαθητής — Ατομικό) ή 'multiple' (checkbox, πολλοί
// μαθητές — Ομαδικό). Native input μέσα σε <label> (ίδιο μοτίβο με το ui/ToggleRow) — καμία ανάγκη
// για custom-σχεδιασμένο indicator, ο browser δίνει ήδη σωστή προσβασιμότητα/ομαδοποίηση.
export default function SelectableStudentRow({ code, nickname, selected, onSelect, mode = 'single', name }) {
  return (
    <Card
      as="label"
      variant="interactive"
      className={`selectable-student-row ${selected ? 'selectable-student-row--selected' : ''}`}
    >
      <input
        type={mode === 'multiple' ? 'checkbox' : 'radio'}
        name={name}
        className="selectable-student-row__input"
        checked={selected}
        onChange={onSelect}
      />
      <span className="selectable-student-row__code">{code}</span>
      {nickname && <span className="selectable-student-row__nickname">{nickname}</span>}
    </Card>
  )
}
