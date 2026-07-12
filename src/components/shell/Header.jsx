import { Menu, Search, User } from 'lucide-react'

// Search και user menu είναι σκόπιμα μη-λειτουργικά placeholders προς το παρόν (βλ. οδηγία) —
// καμία πραγματική αναζήτηση, κανένα login (το SPEC.md δεν προβλέπει login στο MVP).
export default function Header({ onMenuClick }) {
  return (
    <header className="app-shell-header">
      <button
        type="button"
        className="app-shell-header-menu-btn"
        onClick={onMenuClick}
        aria-label="Άνοιγμα μενού πλοήγησης"
      >
        <Menu size={22} />
      </button>

      <div className="app-shell-search">
        <Search size={18} />
        <input type="text" placeholder="Αναζήτηση…" disabled />
        <span className="app-shell-search-soon">Σύντομα</span>
      </div>

      <div className="app-shell-header-spacer" />

      <button type="button" className="app-shell-user-menu">
        <span className="app-shell-user-avatar">
          <User size={16} />
        </span>
        Εκπαιδευτικός
      </button>
    </header>
  )
}
