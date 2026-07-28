import { Check, Minus, Plus, X } from 'lucide-react'
import { PROMPT_LEVELS } from '../config/promptLevels.js'
import { formatRecordedValue } from '../utils/measurementTypes/index.js'
import Button from './ui/Button.jsx'
import Textarea from './ui/Textarea.jsx'
import './GoalRecorder.css'

// Καταχώρηση με ένα tap, προσαρμοσμένη στον τύπο μέτρησης του στόχου. ΑΜΕΤΑΒΛΗΤΑ props/λογική —
// value: η συσσωρευμένη τιμή αυτής της συνεδρίας (μέχρι να πατηθεί «Τέλος»). Η αναίρεση («Αναίρεση
// τελευταίας καταχώρησης») ζει ΕΚΤΟΣ αυτού του component, στο GoalRecorderCard/TeachingMode — εδώ
// μένει μόνο η καταγραφή προς τα εμπρός. Κάθε onChange καλεί με ΠΛΗΡΗ νέα τιμή (ποτέ merge εδώ
// μέσα) — έτσι δουλεύει το undo του TeachingMode χωρίς καμία αλλαγή, ίδιο idiom με τα 4 σημερινά.
//
// Χρωματική διόρθωση έναντι της παλιάς υλοποίησης: η «Δυσκολία» ΔΕΝ είναι σφάλμα/κίνδυνος (είναι
// φυσιολογικό παιδαγωγικό δεδομένο) — άρα ουδέτερο (secondary), όχι danger. Η «Επιτυχία» παίρνει
// το νέο variant «success» (DESIGN_SYSTEM.md §3: «Το success για ... θετική πρόοδο»).
//
// Technical Plan Στάδιο 8 — legacy vs δομημένο: goal.criterionConfig είναι ήδη διαθέσιμο (το goal
// περνάει ολόκληρο). Για taskAnalysis/duration, όταν λείπει criterionConfig, η UI παραμένει
// ΑΚΡΙΒΩΣ η ίδια με σήμερα (legacy goals, χωρίς αλλαγή). Το duration ΔΕΝ αποκτά κανένα νέο κλάδο —
// η κατεύθυνση/στόχος ήδη εμφανίζονται μέσω του criterionHint στο GoalRecorderCard.jsx (goal.criterion).
export default function GoalRecorder({ goal, value, onChange }) {
  if (goal.measurementType === 'successRatio') {
    const successes = value?.successes || 0
    const attempts = value?.attempts || 0
    // Bug report — Teaching Mode: πριν μόνο +1 σε κάθε μετρητή, χωρίς τρόπο διόρθωσης ενός
    // misclick μέσα στην ίδια συνεδρία (πριν την αποθήκευση) χωρίς πλήρες reset. Δεύτερη, μικρότερη
    // σειρά με «−1» ανά μετρητή, ακριβώς κάτω από το αντίστοιχο κουμπί — ίδιο εικονίδιο/idiom με
    // το ήδη υπάρχον Minus του τύπου Συχνότητα. Η «Επιτυχία» αυξάνει ΚΑΙ τους δύο μετρητές μαζί
    // (attempts ΠΑΝΤΑ ≥ successes) — άρα το «−1 Επιτυχία» ΠΡΕΠΕΙ να μειώνει και τους δύο μαζί (η
    // ακριβής αντιστροφή του +1), όχι μόνο το successes, αλλιώς θα προέκυπτε ανέφικτη κατάσταση
    // (π.χ. 2 επιτυχίες σε 1 προσπάθεια). Disabled στα φυσικά όρια — καμία αρνητική τιμή, καμία
    // κατάσταση όπου successes > attempts.
    const canUndoSuccess = successes > 0
    const canUndoDifficulty = attempts > successes
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row">
          <Button
            variant="success"
            icon={Check}
            className="goal-recorder__btn"
            onClick={() => onChange({ successes: successes + 1, attempts: attempts + 1 })}
          >
            Επιτυχία
          </Button>
          <Button
            variant="secondary"
            icon={X}
            className="goal-recorder__btn"
            onClick={() => onChange({ successes, attempts: attempts + 1 })}
          >
            Δυσκολία
          </Button>
        </div>
        <div className="goal-recorder__row goal-recorder__row--adjust">
          <Button
            variant="ghost"
            icon={Minus}
            ariaLabel="Αναίρεση μίας επιτυχίας"
            disabled={!canUndoSuccess}
            className="goal-recorder__btn goal-recorder__btn--adjust"
            onClick={() => onChange({ successes: successes - 1, attempts: attempts - 1 })}
          />
          <Button
            variant="ghost"
            icon={Minus}
            ariaLabel="Αναίρεση μίας δυσκολίας"
            disabled={!canUndoDifficulty}
            className="goal-recorder__btn goal-recorder__btn--adjust"
            onClick={() => onChange({ successes, attempts: attempts - 1 })}
          />
        </div>
        <p className="goal-recorder__tally" aria-live="polite">{successes} / {attempts}</p>
      </div>
    )
  }

  if (goal.measurementType === 'promptLevel') {
    const level = value?.level
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row goal-recorder__row--wrap">
          {PROMPT_LEVELS.map((p) => (
            <Button
              key={p.value}
              variant={level === p.value ? 'primary' : 'secondary'}
              className="goal-recorder__btn"
              onClick={() => onChange({ level: p.value })}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <p className="goal-recorder__tally" aria-live="polite">
          {level ? PROMPT_LEVELS.find((p) => p.value === level)?.label : 'Καμία καταχώρηση ακόμα'}
        </p>
      </div>
    )
  }

  if (goal.measurementType === 'duration') {
    const minutes = value?.minutes || 0
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row">
          <Button variant="secondary" icon={Plus} className="goal-recorder__btn" onClick={() => onChange({ minutes: minutes + 1 })}>
            1 λεπτό
          </Button>
          <Button variant="secondary" icon={Plus} className="goal-recorder__btn" onClick={() => onChange({ minutes: minutes + 5 })}>
            5 λεπτά
          </Button>
        </div>
        <p className="goal-recorder__tally" aria-live="polite">{minutes} λεπτά</p>
      </div>
    )
  }

  // Νέο (Στάδιο 8) — καμία legacy υπόσταση, brand new τύπος. +1 ΚΑΙ −1 (διόρθωση χρήστη — το
  // γενικό undo παραμένει χρήσιμο αλλά δεν πρέπει να είναι ο ΜΟΝΑΔΙΚΟΣ τρόπος διόρθωσης).
  if (goal.measurementType === 'frequency') {
    const count = value?.count || 0
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row">
          <Button
            variant="secondary"
            icon={Minus}
            ariaLabel="Αφαίρεση μίας φοράς"
            disabled={count === 0}
            className="goal-recorder__btn"
            onClick={() => onChange({ count: Math.max(0, count - 1) })}
          />
          <Button
            variant="secondary"
            icon={Plus}
            ariaLabel="Προσθήκη μίας φοράς"
            className="goal-recorder__btn"
            onClick={() => onChange({ count: count + 1 })}
          />
        </div>
        <p className="goal-recorder__tally" aria-live="polite">{formatRecordedValue('frequency', { count })}</p>
      </div>
    )
  }

  if (goal.measurementType === 'taskAnalysis') {
    if (goal.criterionConfig) {
      const { steps, targetCompletedCount } = goal.criterionConfig
      const completedStepIds = value?.completedStepIds || []
      return (
        <div className="goal-recorder">
          <GoalRecorderToggleList
            items={steps}
            completedIds={completedStepIds}
            showNumbers
            onToggle={(id) => onChange({ completedStepIds: toggleId(completedStepIds, id) })}
          />
          <p className="goal-recorder__tally" aria-live="polite">
            {completionTally(completedStepIds.length, steps.length, targetCompletedCount, 'βήματα')}
          </p>
        </div>
      )
    }
    // Legacy (χωρίς criterionConfig) — ΑΚΡΙΒΩΣ η ίδια UI/σχήμα τιμής με σήμερα, καμία αλλαγή.
    const stepsCompleted = value?.stepsCompleted || 0
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row goal-recorder__row--stepper">
          <Button
            variant="secondary"
            icon={Minus}
            ariaLabel="Λιγότερο βήμα"
            disabled={stepsCompleted === 0}
            onClick={() => onChange({ stepsCompleted: Math.max(0, stepsCompleted - 1) })}
          />
          <p className="goal-recorder__tally" aria-live="polite">{stepsCompleted} βήματα</p>
          <Button
            variant="secondary"
            icon={Plus}
            ariaLabel="Ένα βήμα παραπάνω"
            onClick={() => onChange({ stepsCompleted: stepsCompleted + 1 })}
          />
        </div>
      </div>
    )
  }

  // Νέο (Στάδιο 8) — καμία legacy υπόσταση, brand new τύπος.
  if (goal.measurementType === 'checklist') {
    if (!goal.criterionConfig) return null
    const { items, targetCompletedCount } = goal.criterionConfig
    const completedItemIds = value?.completedItemIds || []
    return (
      <div className="goal-recorder">
        <GoalRecorderToggleList
          items={items}
          completedIds={completedItemIds}
          showNumbers={false}
          onToggle={(id) => onChange({ completedItemIds: toggleId(completedItemIds, id) })}
        />
        <p className="goal-recorder__tally" aria-live="polite">
          {completionTally(completedItemIds.length, items.length, targetCompletedCount, 'στοιχεία')}
        </p>
      </div>
    )
  }

  // Νέο (Στάδιο 8) — καμία legacy υπόσταση, brand new τύπος. Κάθετη στοίβα πλήρων γραμμών (όχι 5
  // κουμπιά-σε-σειρά, εγκεκριμένη απόκλιση από το αρχικό sketch) — mobile-friendlier με πλήρες
  // κείμενο περιγραφής ανά βαθμίδα. Button-toggle idiom (ίδιο με promptLevel παραπάνω) γιατί εδώ
  // ΚΑΤΑΓΡΑΦΕΤΑΙ παρατήρηση, δεν επιλέγεται κριτήριο (διαφορετικό από τα ChoiceGroup/radio του wizard).
  if (goal.measurementType === 'ratingScale') {
    if (!goal.criterionConfig) return null
    const level = value?.level
    const { levelDescriptions } = goal.criterionConfig
    return (
      <div className="goal-recorder">
        <div className="goal-recorder__row goal-recorder__row--column">
          {[1, 2, 3, 4, 5].map((n) => (
            <Button
              key={n}
              variant={level === n ? 'primary' : 'secondary'}
              className="goal-recorder__btn goal-recorder__btn--wide"
              onClick={() => onChange({ level: n })}
            >
              {n} — {levelDescriptions[n]}
            </Button>
          ))}
        </div>
        <p className="goal-recorder__tally" aria-live="polite">
          {level ? `Επίπεδο ${level}` : 'Καμία καταχώρηση ακόμα'}
        </p>
      </div>
    )
  }

  // Νέο (Στάδιο 8) — καμία legacy υπόσταση, brand new τύπος. Καμία αριθμητική ένδειξη/tally/πρόοδος
  // (ρητή απόφαση χρήστη — η κρίση του εκπαιδευτικού ΕΙΝΑΙ η μέτρηση, βλ. narrative.js). Ένα άθικτο
  // (κενό) textarea δεν παράγει καμία εγγραφή measurement — βλ. isEmptyRecordedValue/TeachingMode.jsx.
  if (goal.measurementType === 'narrative') {
    const note = value?.note || ''
    return (
      <div className="goal-recorder">
        <Textarea
          aria-label="Παρατήρηση αυτής της συνεδρίας"
          value={note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Πώς πήγε ο στόχος σε αυτή τη συνεδρία;"
        />
      </div>
    )
  }

  return null
}

// Κοινή tap-λίστα για Checklist/Βήματα εργασίας δομημένων στόχων — μοναδική διαφορά είναι το
// showNumbers (η σειρά έχει σημασία μόνο στα Βήματα εργασίας, Checklist όχι). Toggle ΠΑΝΤΑ με
// ΣΤΑΘΕΡΟ item.id, ΠΟΤΕ index (διόρθωση χρήστη) — τα ids είναι ήδη σταθερά, δημιουργήθηκαν στο
// Στάδιο 7 (ListBuilder) και ζουν στο criterionConfig.steps/items.
function GoalRecorderToggleList({ items, completedIds, onToggle, showNumbers }) {
  return (
    <ul className="goal-recorder__list">
      {items.map((item, index) => (
        <li key={item.id}>
          <label className="goal-recorder__list-row">
            <input type="checkbox" checked={completedIds.includes(item.id)} onChange={() => onToggle(item.id)} />
            {showNumbers && <span className="goal-recorder__list-number" aria-hidden="true">{index + 1}.</span>}
            <span className="goal-recorder__list-label">{item.label}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}

function toggleId(ids, id) {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id]
}

// Tally που «λαμβάνει υπόψη» το targetCompletedCount (διόρθωση χρήστη Σταδίου 8) — δείχνει ΚΑΙ
// την αναλογία προς το ΣΥΝΟΛΟ των στοιχείων/βημάτων ΚΑΙ αν έχει φτάσει τον στόχο, όχι μόνο ένα
// αποκομμένο «completed από total» χωρίς σχέση με το κριτήριο.
function completionTally(completed, total, target, noun) {
  const base = `${completed} από ${total} ${noun}`
  return completed >= target ? `${base} — στόχος επιτεύχθηκε ✓` : `${base} (στόχος: ${target})`
}
