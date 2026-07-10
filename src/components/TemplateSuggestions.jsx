import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import ChipListEditor from './ChipListEditor.jsx'

// Προτάσεις (goalStarters/baselineExamples/commonCriteria) του DomainTemplate ενός τομέα.
// Κλικ σε πρόταση = συμπληρώνει το πεδίο. Οι προτάσεις είναι επεξεργάσιμες (προσθήκη/αφαίρεση), αποθηκευμένες στη βάση.
export default function TemplateSuggestions({ domain, field, label, onApply }) {
  const template = useLiveQuery(
    () => (domain ? db.domainTemplates.get(domain) : undefined),
    [domain]
  )

  const items = template?.[field] || []

  // latestRef: η πιο πρόσφατη γνωστή λίστα προτάσεων, ώστε ένα γρήγορο δεύτερο «Προσθήκη»/«✕»
  // πριν προλάβει να επιστρέψει το πρώτο να μη σβήνει αθόρυβα την πρώτη αλλαγή.
  const latestRef = useRef(items)
  useEffect(() => {
    latestRef.current = items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, field])

  if (!domain) return null

  async function handleAdd(value) {
    const next = [...latestRef.current, value]
    latestRef.current = next
    await db.domainTemplates.update(domain, { [field]: next })
  }

  async function handleRemove(index) {
    const next = latestRef.current.filter((_, i) => i !== index)
    latestRef.current = next
    await db.domainTemplates.update(domain, { [field]: next })
  }

  return (
    <div className="suggestions">
      <p className="hint">{label}</p>
      <ChipListEditor
        items={items}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onApply={onApply}
        placeholder="Προσθήκη νέας πρότασης…"
      />
    </div>
  )
}
