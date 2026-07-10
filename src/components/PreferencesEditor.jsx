import { useEffect, useRef } from 'react'
import { PREFERENCE_CATEGORIES } from '../config/preferenceCategories.js'
import ChipListEditor from './ChipListEditor.jsx'

// preferences: { [categoryKey]: string[] } — καθημερινό εργαλείο (καρτέλα ενισχυτών), όχι αρχείο.
export default function PreferencesEditor({ preferences, onChange }) {
  // latestRef: η πιο πρόσφατη γνωστή τιμή, ώστε δύο γρήγορες αλλαγές (π.χ. προσθήκη σε δύο
  // διαφορετικές κατηγορίες πριν προλάβει να επιστρέψει η πρώτη αποθήκευση) να μη σβήνει η μία την άλλη.
  const latestRef = useRef(preferences)
  useEffect(() => {
    latestRef.current = preferences
  }, [preferences])

  function itemsFor(key, source = preferences) {
    return source[key] || []
  }

  function addItem(key, value) {
    const next = { ...latestRef.current, [key]: [...itemsFor(key, latestRef.current), value] }
    latestRef.current = next
    onChange(next)
  }

  function removeItem(key, index) {
    const next = { ...latestRef.current, [key]: itemsFor(key, latestRef.current).filter((_, i) => i !== index) }
    latestRef.current = next
    onChange(next)
  }

  return (
    <div className="section">
      <h2>Καρτέλα ενισχυτών</h2>
      {PREFERENCE_CATEGORIES.map(({ key, label }) => (
        <fieldset key={key}>
          <legend>{label}</legend>
          <ChipListEditor
            items={itemsFor(key)}
            onAdd={(value) => addItem(key, value)}
            onRemove={(index) => removeItem(key, index)}
          />
        </fieldset>
      ))}
    </div>
  )
}
