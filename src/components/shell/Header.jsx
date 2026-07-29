import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, ChevronDown, Menu, Search, User } from 'lucide-react'
import { getDisplayName } from '../../db.js'
import useAuth from '../../auth/useAuth.js'
import { useNotifications } from './NotificationsProvider.jsx'

// Search είναι σκόπιμα μη-λειτουργικός placeholder προς το παρόν (βλ. οδηγία) — καμία πραγματική
// αναζήτηση.
//
// Κουδούνι ειδοποιήσεων (Notifications Inbox, review χρήστη) — ΕΔΩ, ΟΧΙ έκτο στοιχείο στο
// Sidebar/BottomNav: το Header είναι το ΜΟΝΟ κομμάτι του κελύφους ορατό σε ΚΑΘΕ πλάτος οθόνης
// (το Sidebar/BottomNav εναλλάσσονται ανά breakpoint), και το BottomNav είναι ήδη ισομοιρασμένο
// flex — ένα 6ο στοιχείο θα στένευε όλα τα tap targets σε mobile. Ο αριθμός στο badge είναι
// ΑΚΡΙΒΩΣ το πλήθος ορατών ειδοποιήσεων (visible.length) — ΟΧΙ «unread» (καμία νέα seenAt
// σημασιολογία, review χρήστη), το ΙΔΙΟ νούμερο με τον τίτλο του HomeAttentionWidget.
//
// Teacher Profile + Settings (UI Design v3, εγκεκριμένο) — το user-menu ήταν μέχρι πρόσφατα
// στατικό, μη-λειτουργικό κείμενο («Εκπαιδευτικός», χωρίς onClick). Πλέον πραγματικός σύνδεσμος
// προς το /settings (tab «Προφίλ»), με το πραγματικό μικρό όνομα — ΜΟΝΟ το πρώτο όνομα (όχι
// ολόκληρο το displayName): πιο ευανάγνωστο σε ένα στενό κουμπί από ένα κομμένο αρχικό επιθέτου.
// Το ChevronDown δίπλα σηματοδοτεί «μενού» — ίδιο εικονίδιο/έννοια με το ήδη υπάρχον
// disclosure-pattern του FunctionalProfileEditor/GoalRecorderCard (rotating chevron = «εδώ ανοίγει
// κάτι»), όχι νέο οπτικό λεξιλόγιο.
export default function Header({ onMenuClick }) {
  const { status: notifStatus, visible } = useNotifications()
  const count = notifStatus === 'ok' ? visible.length : 0

  const displayName = useLiveQuery(getDisplayName, [])
  const { status: authStatus, email } = useAuth()
  const firstName = displayName ? displayName.trim().split(/\s+/)[0] : null
  const userLabel = firstName || (authStatus === 'loggedIn' && email) || 'Εκπαιδευτικός'
  const avatarInitial = userLabel !== 'Εκπαιδευτικός' ? userLabel.charAt(0).toUpperCase() : null

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

      <Link to="/settings" className="app-shell-user-menu" aria-label={`Προφίλ — ${userLabel}`}>
        <span className="app-shell-user-avatar">
          {avatarInitial || <User size={16} />}
        </span>
        <span className="app-shell-user-name">{userLabel}</span>
        <ChevronDown size={15} aria-hidden="true" className="app-shell-user-chevron" />
      </Link>
    </header>
  )
}
