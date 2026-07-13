import './Tabs.css'

// Οριζόντια tabs — γενικό, controlled component (ο γονέας κρατάει το activeId). Καθαρά
// navigational· ΔΕΝ αποφασίζει τι περιεχόμενο δείχνεται, μόνο ποιο tab είναι ενεργό.
// tabs: [{ id, label }]
export default function Tabs({ tabs, activeId, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          id={`tab-${tab.id}`}
          aria-controls={`tabpanel-${tab.id}`}
          className={`tabs__tab ${tab.id === activeId ? 'tabs__tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
