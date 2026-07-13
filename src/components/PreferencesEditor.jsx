import { useEffect, useRef } from 'react'
import { AlertTriangle, Ban, Gamepad2, Heart, Smile, Star } from 'lucide-react'
import { PREFERENCE_CATEGORIES } from '../config/preferenceCategories.js'
import Card from './ui/Card.jsx'
import ChipListEditor from './ChipListEditor.jsx'
import './PreferencesEditor.css'

// Μόνο presentational εικονίδιο ανά κατηγορία — δεν αγγίζει το preferenceCategories.js (πηγή αλήθειας
// για τα labels/κλειδιά). preferences: { [categoryKey]: string[] } — καθημερινό εργαλείο, όχι αρχείο.
const ICON_BY_KEY = {
  likes: Heart,
  dislikes: Ban,
  reinforcers: Star,
  favoriteActivities: Gamepad2,
  triggers: AlertTriangle,
  calmingThings: Smile
}

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
    <div className="preferences-editor__grid">
      {PREFERENCE_CATEGORIES.map(({ key, label }) => {
        const Icon = ICON_BY_KEY[key]
        return (
          <Card key={key} className="preferences-editor__card">
            <div className="preferences-editor__card-header">
              {Icon && (
                <span className="preferences-editor__card-icon">
                  <Icon size={16} aria-hidden="true" />
                </span>
              )}
              <h3 className="preferences-editor__card-title">{label}</h3>
            </div>
            <ChipListEditor
              items={itemsFor(key)}
              onAdd={(value) => addItem(key, value)}
              onRemove={(index) => removeItem(key, index)}
            />
          </Card>
        )
      })}
    </div>
  )
}
