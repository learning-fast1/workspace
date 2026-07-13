import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { DOMAINS } from '../config/domains.js'
import { PROFILE_OPTIONS } from '../config/profileOptions.js'
import Badge from './ui/Badge.jsx'
import FormField from './ui/FormField.jsx'
import Textarea from './ui/Textarea.jsx'
import './FunctionalProfileEditor.css'

// functionalProfile: [{ domain, checkedOptions: [], notes }] — ένα entry ανά τομέα που έχει
// συμπληρωθεί. ΑΜΕΤΑΒΛΗΤΗ business logic έναντι της παλιάς υλοποίησης — μόνο η παρουσίαση αλλάζει
// (master-detail σε desktop/tablet, accordion με μία ενότητα ανοιχτή σε mobile — DESIGN_SYSTEM.md §15).
export default function FunctionalProfileEditor({ functionalProfile, onChange }) {
  const [notesDrafts, setNotesDrafts] = useState({})
  // Ξεχωριστό state για desktop (master-detail, πάντα κάτι επιλεγμένο) και mobile (accordion,
  // μπορεί να είναι όλα κλειστά) — ΕΠΙΤΗΔΕΣ όχι κοινό state: και τα δύο layouts είναι ΠΑΝΤΑ στο DOM
  // ταυτόχρονα (CSS εναλλάσσει ποιο φαίνεται, βλ. CSS), οπότε ένα κοινό state θα άνοιγε το ΙΔΙΟ
  // section σε ΔΥΟ σημεία του DOM μαζί — διπλά ids (notes-{domain}) σε ένα <textarea>, άκυρο HTML.
  const [selectedDomain, setSelectedDomain] = useState(DOMAINS[0].id)
  const [openMobileDomain, setOpenMobileDomain] = useState(null)

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

  // idSuffix: τα δύο layouts (master-detail/accordion) είναι ΠΑΝΤΑ και τα δύο στο DOM (βλ. σχόλιο
  // στο state παραπάνω) — ξεχωριστό suffix εξασφαλίζει μοναδικά ids ακόμα κι αν κάποια στιγμή δείξουν
  // ταυτόχρονα τον ίδιο τομέα (π.χ. ίδιος πρώτος τομέας επιλεγμένος και στα δύο εξ ορισμού).
  function renderDomainContent(domainId, idSuffix) {
    const entry = getEntry(domainId)
    const options = PROFILE_OPTIONS[domainId] || []
    const isGrouped = options.length > 0 && typeof options[0] === 'object'
    const groups = isGrouped ? options : [{ group: 'Επιλογές', options }]
    const notesId = `notes-${domainId}-${idSuffix}`

    return (
      <>
        {groups.map(({ group, options: groupOptions }) => (
          <fieldset key={group} className="profile-editor__fieldset">
            <legend className="profile-editor__legend">{group}</legend>
            {groupOptions.map((option) => (
              <label key={option} className="profile-editor__checkbox-row">
                <input
                  type="checkbox"
                  checked={entry.checkedOptions.includes(option)}
                  onChange={() => toggleOption(domainId, option)}
                />
                {option}
              </label>
            ))}
          </fieldset>
        ))}
        <FormField htmlFor={notesId} label="Παρατηρήσεις">
          <Textarea
            id={notesId}
            value={notesDrafts[domainId] ?? entry.notes}
            onChange={(e) => handleNotesChange(domainId, e.target.value)}
          />
        </FormField>
      </>
    )
  }

  const desktopSelected = selectedDomain || DOMAINS[0].id
  const selectedDomainName = DOMAINS.find((d) => d.id === desktopSelected)?.name

  return (
    <div className="profile-editor">
      {/* Desktop/tablet (≥768px): master-detail — βλ. CSS. */}
      <div className="profile-editor__master-detail">
        <nav className="profile-editor__domain-nav" aria-label="Τομείς λειτουργικού προφίλ">
          {DOMAINS.map(({ id, name }) => {
            const entry = getEntry(id)
            return (
              <button
                key={id}
                type="button"
                className={`profile-editor__domain-btn ${desktopSelected === id ? 'profile-editor__domain-btn--active' : ''}`}
                onClick={() => setSelectedDomain(id)}
              >
                <span>{name}</span>
                {entry.checkedOptions.length > 0 && <Badge variant="primary">{entry.checkedOptions.length}</Badge>}
              </button>
            )
          })}
        </nav>
        <div className="profile-editor__panel">
          <h3 className="profile-editor__panel-title">{selectedDomainName}</h3>
          {renderDomainContent(desktopSelected, 'desktop')}
        </div>
      </div>

      {/* Mobile (<768px): accordion, μία ενότητα ανοιχτή κάθε φορά — δικό του, ανεξάρτητο state. */}
      <div className="profile-editor__accordion">
        {DOMAINS.map(({ id, name }) => {
          const entry = getEntry(id)
          const isOpen = openMobileDomain === id
          return (
            <div key={id} className="profile-editor__accordion-item">
              <button
                type="button"
                className="profile-editor__accordion-header"
                aria-expanded={isOpen}
                onClick={() => setOpenMobileDomain(isOpen ? null : id)}
              >
                <span>{name}</span>
                <span className="profile-editor__accordion-header-right">
                  {entry.checkedOptions.length > 0 && <Badge variant="primary">{entry.checkedOptions.length}</Badge>}
                  <ChevronDown size={16} className={`profile-editor__chevron ${isOpen ? 'profile-editor__chevron--open' : ''}`} aria-hidden="true" />
                </span>
              </button>
              {isOpen && <div className="profile-editor__accordion-body">{renderDomainContent(id, 'mobile')}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
