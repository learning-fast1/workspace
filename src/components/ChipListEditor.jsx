import { useState } from 'react'
import { X } from 'lucide-react'
import Input from './ui/Input.jsx'
import Button from './ui/Button.jsx'
import './ChipListEditor.css'

// Κοινό UI για μια λίστα από chips με προσθήκη/αφαίρεση — χρησιμοποιείται τόσο για τις
// προτάσεις τομέα (TemplateSuggestions, onApply → «suggestion» εμφάνιση σαν κάρτα) όσο και για
// την καρτέλα ενισχυτών (PreferencesEditor, απλές ετικέτες → στρογγυλό chip). Η διαχείριση
// δεδομένων (πού αποθηκεύεται η λίστα, πώς αποφεύγεται η απώλεια σε γρήγορες αλλαγές) μένει στον
// γονέα — αυτό το component ξέρει μόνο πώς να τη σχεδιάσει.
export default function ChipListEditor({ items, onAdd, onRemove, onApply, placeholder = 'Προσθήκη…' }) {
  const [draft, setDraft] = useState('')
  const isSuggestion = Boolean(onApply)

  function handleAdd() {
    const value = draft.trim()
    if (!value) return
    onAdd(value)
    setDraft('')
  }

  return (
    <div className="chip-list-editor">
      <div className="chip-list-editor__list">
        {items.map((item, index) => (
          <span key={index} className={`chip-list-editor__chip ${isSuggestion ? 'chip-list-editor__chip--suggestion' : ''}`}>
            {isSuggestion ? (
              <button type="button" className="chip-list-editor__apply" onClick={() => onApply(item)}>{item}</button>
            ) : (
              <span className="chip-list-editor__text">{item}</span>
            )}
            <button
              type="button"
              className="chip-list-editor__remove"
              onClick={() => onRemove(index)}
              aria-label={`Αφαίρεση ${item}`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="chip-list-editor__add-row">
        <Input
          className="chip-list-editor__add-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="secondary" onClick={handleAdd}>Προσθήκη</Button>
      </div>
    </div>
  )
}
