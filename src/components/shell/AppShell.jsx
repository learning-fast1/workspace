import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import BottomNav from './BottomNav.jsx'
import Header from './Header.jsx'
import '../../design/tokens.css'
import './AppShell.css'

// Νέα υποδομή UI (DESIGN_SYSTEM.md) — αυτόνομη, ΔΕΝ χρησιμοποιείται ακόμα από καμία υπάρχουσα
// σελίδα/route. Προορίζεται να τυλίξει αργότερα, μία-μία, τις υπάρχουσες σελίδες. Δεν αγγίζει
// business logic, IndexedDB, ή routing — είναι καθαρά οπτικό/δομικό κέλυφος γύρω από `children`.
export default function AppShell({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="app-shell">
      <div className="app-shell-body">
        <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <div className="app-shell-content">
          <Header onMenuClick={() => setDrawerOpen((v) => !v)} />
          <main className="app-shell-main">{children}</main>
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
