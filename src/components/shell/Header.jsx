import { Link } from 'react-router-dom'
import { Bell, Menu, Search, User } from 'lucide-react'
import { useNotifications } from './NotificationsProvider.jsx'

// Search και user menu είναι σκόπιμα μη-λειτουργικά placeholders προς το παρόν (βλ. οδηγία) —
// καμία πραγματική αναζήτηση, κανένα login (το SPEC.md δεν προβλέπει login στο MVP).
//
// Κουδούνι ειδοποιήσεων (Notifications Inbox, review χρήστη) — ΕΔΩ, ΟΧΙ έκτο στοιχείο στο
// Sidebar/BottomNav: το Header είναι το ΜΟΝΟ κομμάτι του κελύφους ορατό σε ΚΑΘΕ πλάτος οθόνης
// (το Sidebar/BottomNav εναλλάσσονται ανά breakpoint), και το BottomNav είναι ήδη ισομοιρασμένο
// flex — ένα 6ο στοιχείο θα στένευε όλα τα tap targets σε mobile. Ο αριθμός στο badge είναι
// ΑΚΡΙΒΩΣ το πλήθος ορατών ειδοποιήσεων (visible.length) — ΟΧΙ «unread» (καμία νέα seenAt
// σημασιολογία, review χρήστη), το ΙΔΙΟ νούμερο με τον τίτλο του HomeAttentionWidget.
export default function Header({ onMenuClick }) {
  const { status, visible } = useNotifications()
  const count = status === 'ok' ? visible.length : 0

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

      <Link to="/notifications" className="app-shell-notifications-btn" aria-label={`Ειδοποιήσεις${count > 0 ? ` (${count})` : ''}`}>
        <Bell size={20} />
        {count > 0 && <span className="app-shell-notifications-badge">{count}</span>}
      </Link>

      <button type="button" className="app-shell-user-menu">
        <span className="app-shell-user-avatar">
          <User size={16} />
        </span>
        Εκπαιδευτικός
      </button>
    </header>
  )
}
