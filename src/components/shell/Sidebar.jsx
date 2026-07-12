import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navItems.js'

// Desktop (>=1024px): πάντα ορατό, σταθερό. Tablet (768–1023px): drawer, ελέγχεται από το
// `open`/`onClose` (βλ. AppShell). Mobile (<768px): κρυφό — βλ. BottomNav.jsx αντ' αυτού.
export default function Sidebar({ open, onClose }) {
  return (
    <>
      <aside className={`app-shell-sidebar ${open ? 'open' : ''}`}>
        <div className="app-shell-sidebar-header">Workspace</div>
        <nav className="app-shell-nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="app-shell-nav-link" onClick={onClose}>
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="app-shell-backdrop" onClick={onClose} />
    </>
  )
}
