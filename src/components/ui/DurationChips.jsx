import Button from './Button.jsx'
import Input from './Input.jsx'
import './DurationChips.css'

// Γρήγορη επιλογή διάρκειας (λεπτά) — chips + προαιρετικό custom πεδίο. Εξαγωγή του ήδη υπάρχοντος
// inline μοτίβου του Teaching Mode/SessionModal (Sprint 6, ScheduleSlotForm — δεύτερο σημείο
// χρήσης άξιζε εξαγωγή, COMPONENT_GUIDE §«μία φορά είναι OK, δεύτερη φορά εξάγεται»). Το Teaching
// Mode/SessionModal ΔΕΝ άλλαξαν να το χρησιμοποιήσουν — εκτός του εγκεκριμένου scope αυτού του
// sprint, παραμένει σημειωμένο tech debt.
// value/onChange: raw number (λεπτά) ή null — ίδιο opinionated μοτίβο με DateField/MoodPicker.
export default function DurationChips({ options, value, onChange, customPlaceholder = 'Άλλη διάρκεια (λεπτά)' }) {
  const isCustomValue = value != null && !options.includes(value)

  function handleCustomChange(raw) {
    const n = Number(raw)
    onChange(raw && n > 0 ? n : null)
  }

  return (
    <div className="duration-chips">
      <div className="duration-chips__options">
        {options.map((d) => (
          <Button key={d} variant={value === d ? 'primary' : 'secondary'} onClick={() => onChange(d)}>
            {d}′
          </Button>
        ))}
      </div>
      <Input
        type="number"
        min="1"
        placeholder={customPlaceholder}
        value={isCustomValue ? value : ''}
        onChange={(e) => handleCustomChange(e.target.value)}
      />
    </div>
  )
}
