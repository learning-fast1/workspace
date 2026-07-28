import { Link, NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navItems.js'
import SidebarQuickSchedule from './SidebarQuickSchedule.jsx'
import logo from '../../assets/logo.png'

// Desktop (>=1024px): πάντα ορατό, σταθερό. Tablet (768–1023px): drawer, ελέγχεται από το
// `open`/`onClose` (βλ. AppShell). Mobile (<768px): κρυφό — βλ. BottomNav.jsx αντ' αυτού.
// Το SidebarQuickSchedule (Sprint 6) ζει ΜΟΝΟ εδώ, κάτω από τα nav items («Ρυθμίσεις» είναι το
// τελευταίο) — δεν μπαίνει ποτέ στο BottomNav.jsx, άρα δεν εμφανίζεται καθόλου σε mobile.
export default function Sidebar({ open, onClose }) {
  return (
    <>
      <aside className={`app-shell-sidebar ${open ? 'open' : ''}`}>
        <Link to="/" className="app-shell-sidebar-header" onClick={onClose} aria-label="Αρχική">
          <img src={logo} alt="" className="app-shell-sidebar-logo" />
        </Link>
        <nav className="app-shell-nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="app-shell-nav-link" onClick={onClose}>
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
        <SidebarQuickSchedule />
      </aside>
      <div className="app-shell-backdrop" onClick={onClose} />
    </>
  )
}
