import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, ChevronDown, LogOut, Menu, Settings as SettingsIcon, User } from 'lucide-react'
import { CLOUD_ENABLED, getDisplayName } from '../../db.js'
import useAuth from '../../auth/useAuth.js'
import { useNotifications } from './NotificationsProvider.jsx'
import OverflowMenu from '../ui/OverflowMenu.jsx'
import HeaderSearch from './HeaderSearch.jsx'

// Κουδούνι ειδοποιήσεων (Notifications Inbox, review χρήστη) — ΕΔΩ, ΟΧΙ έκτο στοιχείο στο
// Sidebar/BottomNav: το Header είναι το ΜΟΝΟ κομμάτι του κελύφους ορατό σε ΚΑΘΕ πλάτος οθόνης
// (το Sidebar/BottomNav εναλλάσσονται ανά breakpoint), και το BottomNav είναι ήδη ισομοιρασμένο
// flex — ένα 6ο στοιχείο θα στένευε όλα τα tap targets σε mobile. Ο αριθμός στο badge είναι
// ΑΚΡΙΒΩΣ το πλήθος ορατών ειδοποιήσεων (visible.length) — ΟΧΙ «unread» (καμία νέα seenAt
// σημασιολογία, review χρήστη), το ΙΔΙΟ νούμερο με τον τίτλο του HomeAttentionWidget.
//
// User menu (review χρήστη — «πραγματικό dropdown, όχι απευθείας link»): πλέον πραγματικό menu
// (OverflowMenu, γενικευμένο trigger — βλ. OverflowMenu.jsx), ΟΧΙ πια <Link> κατευθείαν στο
// /settings. Ένα μόνο στοιχείο «Ρυθμίσεις» (ΧΩΡΙΣ ξεχωριστό «Το προφίλ μου» — το Settings.jsx ήδη
// προσγειώνεται στο tab «Προφίλ» εξ ορισμού χωρίς state, άρα ένα δεύτερο item θα ήταν ακριβώς ο
// ίδιος προορισμός με άλλο όνομα, review χρήστη). «Αποσύνδεση» εμφανίζεται ΜΟΝΟ όταν υπάρχει
// πράγματι ενεργή σύνδεση να τερματιστεί — ίδια συνθήκη με το κουμπί στο AccountSection.jsx.
export default function Header({ onMenuClick }) {
  const navigate = useNavigate()
  const { status: notifStatus, visible } = useNotifications()
  const count = notifStatus === 'ok' ? visible.length : 0

  const displayName = useLiveQuery(getDisplayName, [])
  const { status: authStatus, email, actions } = useAuth()
  const firstName = displayName ? displayName.trim().split(/\s+/)[0] : null
  const userLabel = firstName || (authStatus === 'loggedIn' && email) || 'Εκπαιδευτικός'
  const avatarInitial = userLabel !== 'Εκπαιδευτικός' ? userLabel.charAt(0).toUpperCase() : null

  const menuItems = [
    { label: 'Ρυθμίσεις', icon: SettingsIcon, onClick: () => navigate('/settings') }
  ]
  if (CLOUD_ENABLED && authStatus === 'loggedIn') {
    menuItems.push({ label: 'Αποσύνδεση', icon: LogOut, variant: 'danger', onClick: () => actions.logout() })
  }

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

      <HeaderSearch />

      <div className="app-shell-header-spacer" />

      <Link to="/notifications" className="app-shell-notifications-btn" aria-label={`Ειδοποιήσεις${count > 0 ? ` (${count})` : ''}`}>
        <Bell size={20} />
        {count > 0 && <span className="app-shell-notifications-badge">{count}</span>}
      </Link>

      <OverflowMenu
        items={menuItems}
        ariaLabel={`Προφίλ — ${userLabel}`}
        triggerClassName="app-shell-user-menu"
        renderTrigger={() => (
          <>
            <span className="app-shell-user-avatar">
              {avatarInitial || <User size={16} />}
            </span>
            <span className="app-shell-user-name">{userLabel}</span>
            <ChevronDown size={15} aria-hidden="true" className="app-shell-user-chevron" />
          </>
        )}
      />
    </header>
  )
}
