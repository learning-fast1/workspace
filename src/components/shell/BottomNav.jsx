import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navItems.js'

// Μόνο mobile (<768px) — βλ. AppShell.css. Ίδια στοιχεία πλοήγησης με το Sidebar.
export default function BottomNav() {
  return (
    <nav className="app-shell-bottom-nav">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="app-shell-bottom-nav-link">
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
