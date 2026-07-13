import Button from './Button.jsx'
import './SectionHeader.css'

// Χωρίζει ενότητες ΜΕΣΑ σε μια σελίδα (π.χ. μέσα σε ένα tab) — ΔΕΝ αντικαθιστά το PageHeader.
// action.variant προεπιλέγεται σε 'secondary' (COMPONENT_GUIDE.md). Προσοχή αν κάποιος καλών
// περάσει 'primary': ισχύει ο γενικός κανόνας «μία primary ενέργεια ανά οθόνη» — έλεγξε πρώτα
// ότι δεν υπάρχει ήδη άλλο primary button ορατό στην ίδια οθόνη (π.χ. σε Hero/PageHeader).
export default function SectionHeader({ title, description, action }) {
  return (
    <div className="section-header">
      <div className="section-header__text">
        <h2 className="section-header__title">{title}</h2>
        {description && <p className="section-header__description">{description}</p>}
      </div>
      {action && (
        <Button variant={action.variant || 'secondary'} icon={action.icon} onClick={action.onClick} to={action.to}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
