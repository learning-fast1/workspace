import { Link, NavLink, useMatch } from 'react-router-dom'
import { NAV_ITEMS } from './navItems.js'
import SidebarQuickSchedule from './SidebarQuickSchedule.jsx'
import logo from '../../assets/logo.png'

// Desktop (>=1024px): πάντα ορατό, σταθερό. Tablet (768–1023px): drawer, ελέγχεται από το
// `open`/`onClose` (βλ. AppShell). Mobile (<768px): κρυφό — βλ. BottomNav.jsx αντ' αυτού.
// Το SidebarQuickSchedule (Sprint 6) ζει ΜΟΝΟ εδώ, κάτω από τα nav items («Ρυθμίσεις» είναι το
// τελευταίο) — δεν μπαίνει ποτέ στο BottomNav.jsx, άρα δεν εμφανίζεται καθόλου σε mobile.
//
// Sprint 8: κρύβεται ΕΙΔΙΚΑ στην Αρχική (route «/») — εκεί το πλήρες «Η μέρα μου» (TodayQueue) είναι
// ήδη ορατό στο κύριο περιεχόμενο, οπότε αυτή η προεπισκόπηση 3 γραμμών δεν προσθέτει τίποτα, μόνο
// διπλή πληροφορία (Product Design Proposal §5). Σε κάθε άλλη σελίδα παραμένει όπως πριν.
// useMatch('/') αντί για χειροκίνητη σύγκριση pathname — exact matching μέσω του ίδιου του router,
// άρα ανθεκτικό σε trailing slash/μελλοντικές αλλαγές routing (καμία τέτοια περίπτωση αγγίζει το «/»
// σήμερα — βλ. App.jsx, το «/» είναι leaf route, καμία εμφωλευμένη διαδρομή από κάτω του).
export default function Sidebar({ open, onClose }) {
  const isHome = useMatch('/')

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
        {!isHome && <SidebarQuickSchedule />}
      </aside>
      <div className="app-shell-backdrop" onClick={onClose} />
    </>
  )
}
