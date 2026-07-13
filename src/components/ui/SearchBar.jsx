import { Search, X } from 'lucide-react'
import './SearchBar.css'

// Ελεγχόμενο πεδίο αναζήτησης — τοπικό μόνο, το state κρατιέται από τον γονέα (δεν κάνει το ίδιο
// καμία query). Το κουμπί καθαρισμού εμφανίζεται μόνο όταν υπάρχει κείμενο.
export default function SearchBar({ value, onChange, onClear, placeholder, ariaLabel }) {
  return (
    <div className="search-bar">
      <Search size={18} className="search-bar__icon" aria-hidden="true" />
      <input
        type="text"
        className="search-bar__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
      />
      {value && (
        <button type="button" className="search-bar__clear" onClick={onClear} aria-label="Καθαρισμός αναζήτησης">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
