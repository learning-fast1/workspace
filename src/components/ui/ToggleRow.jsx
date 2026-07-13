import './ToggleRow.css'

// Απλή checkbox+label γραμμή για δυαδικά φίλτρα (π.χ. «Εμφάνιση αρχειοθετημένων», «Εμφάνιση όλων»).
// `className` προαιρετικό, για page-specific προσαρμογές (π.χ. margin) πάνω στο κοινό .toggle-row.
export default function ToggleRow({ checked, onChange, children, className = '' }) {
  return (
    <label className={`toggle-row ${className}`.trim()}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  )
}
