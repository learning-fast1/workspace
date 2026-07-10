import { useState } from 'react'

// Κοινό UI για μια λίστα από chips με προσθήκη/αφαίρεση — χρησιμοποιείται τόσο για τις
// προτάσεις τομέα (TemplateSuggestions) όσο και για την καρτέλα ενισχυτών (PreferencesEditor).
// Η διαχείριση δεδομένων (πού αποθηκεύεται η λίστα, πώς αποφεύγεται η απώλεια σε γρήγορες
// αλλαγές) μένει στον γονέα — αυτό το component ξέρει μόνο πώς να τη σχεδιάσει.
export default function ChipListEditor({ items, onAdd, onRemove, onApply, placeholder = 'Προσθήκη…' }) {
  const [draft, setDraft] = useState('')

  function handleAdd() {
    const value = draft.trim()
    if (!value) return
    onAdd(value)
    setDraft('')
  }

  return (
    <>
      <div className="chip-list">
        {items.map((item, index) => (
          <span key={index} className={`chip ${onApply ? 'chip-suggestion' : ''}`}>
            {onApply ? (
              <button type="button" className="chip-apply" onClick={() => onApply(item)}>{item}</button>
            ) : (
              item
            )}
            <button type="button" className="chip-remove" onClick={() => onRemove(index)} aria-label={`Αφαίρεση ${item}`}>✕</button>
          </span>
        ))}
      </div>
      <div className="add-item-row">
        <input
          type="text"
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
        <button type="button" className="btn btn-secondary" onClick={handleAdd}>Προσθήκη</button>
      </div>
    </>
  )
}
