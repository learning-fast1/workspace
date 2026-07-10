import { useEffect, useRef, useState } from 'react'
import { DOMAINS } from '../config/domains.js'
import { PROFILE_OPTIONS } from '../config/profileOptions.js'

// functionalProfile: [{ domain, checkedOptions: [], notes }] — ένα entry ανά τομέα που έχει συμπληρωθεί.
export default function FunctionalProfileEditor({ functionalProfile, onChange }) {
  // Τοπικό buffer για τις Παρατηρήσεις: η οθόνη δείχνει πάντα ό,τι μόλις πληκτρολόγησε ο χρήστης,
  // χωρίς να περιμένει το round-trip της αποθήκευσης — αλλιώς σε γρήγορη πληκτρολόγηση χάνονται χαρακτήρες.
  const [notesDrafts, setNotesDrafts] = useState({})

  // latestRef: η πιο πρόσφατη γνωστή τιμή (prop, ή πιο πρόσφατη τοπική εγγραφή που δεν έχει φτάσει
  // ακόμα πίσω μέσω του round-trip). Χρησιμοποιείται ΜΟΝΟ για να υπολογίζεται η επόμενη αλλαγή —
  // αλλιώς δύο γρήγορες αλλαγές (π.χ. δύο checkboxes σε γρήγορη διαδοχή) θα υπολόγιζαν και οι δύο
  // πάνω στο ίδιο παλιό snapshot, και η δεύτερη εγγραφή θα έσβηνε αθόρυβα την πρώτη.
  const latestRef = useRef(functionalProfile)
  useEffect(() => {
    latestRef.current = functionalProfile
  }, [functionalProfile])

  function getEntry(domain, source = functionalProfile) {
    return source.find((e) => e.domain === domain) || { domain, checkedOptions: [], notes: '' }
  }

  function updateEntry(domain, patch) {
    const current = getEntry(domain, latestRef.current)
    const updated = { ...current, ...patch }
    const next = [...latestRef.current.filter((e) => e.domain !== domain), updated]
    latestRef.current = next
    onChange(next)
  }

  function handleNotesChange(domain, value) {
    setNotesDrafts((prev) => ({ ...prev, [domain]: value }))
    updateEntry(domain, { notes: value })
  }

  function toggleOption(domain, option) {
    const entry = getEntry(domain, latestRef.current)
    const checked = entry.checkedOptions.includes(option)
    const checkedOptions = checked
      ? entry.checkedOptions.filter((o) => o !== option)
      : [...entry.checkedOptions, option]
    updateEntry(domain, { checkedOptions })
  }

  return (
    <div className="section">
      <h2>Λειτουργικό προφίλ</h2>
      {DOMAINS.map(({ id, name }) => {
        const entry = getEntry(id)
        const options = PROFILE_OPTIONS[id] || []
        const isGrouped = options.length > 0 && typeof options[0] === 'object'
        const groups = isGrouped ? options : [{ group: 'Επιλογές', options }]
        return (
          <details key={id}>
            <summary>
              {name}
              {entry.checkedOptions.length > 0 ? ` (${entry.checkedOptions.length})` : ''}
            </summary>
            {groups.map(({ group, options: groupOptions }) => (
              <fieldset key={group}>
                <legend>{group}</legend>
                {groupOptions.map((option) => (
                  <label key={option} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={entry.checkedOptions.includes(option)}
                      onChange={() => toggleOption(id, option)}
                    />
                    {option}
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="field">
              <label>Παρατηρήσεις</label>
              <textarea
                value={notesDrafts[id] ?? entry.notes}
                onChange={(e) => handleNotesChange(id, e.target.value)}
              />
            </div>
          </details>
        )
      })}
    </div>
  )
}
