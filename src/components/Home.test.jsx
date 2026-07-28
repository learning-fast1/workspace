import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import db, { setLastBackupAt } from '../db.js'
import Home from './Home.jsx'

// exportBackupFile() κάνει πραγματικό DOM download (Blob/createObjectURL/anchor click) — άσχετο με
// το τι εξετάζει αυτό το test file (το wiring του Home.jsx banner). Mock ολόκληρου του module ώστε
// το κλικ στο κουμπί να είναι ελέγξιμο χωρίς να εξαρτόμαστε από jsdom download APIs.
vi.mock('../utils/backup.js', () => ({
  exportBackupFile: vi.fn().mockResolvedValue({ filename: 'workspace-backup-test.json', counts: {} })
}))
import { exportBackupFile } from '../utils/backup.js'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
  vi.clearAllMocks()
})

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  )
}

// Σχετικό με «τώρα» (ΟΧΙ hardcoded απόλυτη ημερομηνία) — bug βρέθηκε ζωντανά: 3 tests παρακάτω
// χρησιμοποιούσαν ένα σταθερό '2026-07-20', το οποίο σταμάτησε να είναι «πρόσφατο» (<7 μέρες, βλ.
// BACKUP_REMINDER_AFTER_DAYS στο Home.jsx) μόλις πέρασε αρκετός πραγματικός χρόνος — άσχετο με το
// Smart Notifications work, εντοπίστηκε τρέχοντας το πλήρες suite.
function recentBackupISO(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
}

// Feedback χρήστη: πριν, το backup banner εξαφανιζόταν ΕΝΤΕΛΩΣ μόλις γινόταν το πρώτο backup — ο
// χρήστης έχανε κάθε ορατότητα στην κατάσταση του backup. Τώρα γίνεται μόνιμο, ήρεμο status (πράσινο)
// αντί να εξαφανίζεται, με δυνατότητα νέου backup με ένα tap.
// Readiness blockers v1 (review χρήστη) — αφαίρεση hardcoded «Βικτώρια», γενικό fallback
// «Καλημέρα» χωρίς όνομα/κόμμα όταν δεν έχει ρυθμιστεί τίποτα.
describe('Home — χαιρετισμός (displayName)', () => {
  it('χωρίς ρυθμισμένο displayName → απλό «Καλημέρα», ΧΩΡΙΣ κόμμα/όνομα', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Καλημέρα'))
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(',')
  })

  it('με ρυθμισμένο displayName → «Καλημέρα, {όνομα}»', async () => {
    await db.userSettings.put({ key: 'displayName', value: 'Όλγα', updatedAt: '2026-01-01T00:00:00.000Z' })
    renderHome()
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Καλημέρα, Όλγα'))
  })
})

describe('Home — backup banner', () => {
  it('χωρίς κανένα backup ποτέ → banner προειδοποίησης, ΚΑΝΕΝΑ status', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByText('Δεν έχεις κάνει ποτέ αντίγραφο ασφαλείας.')).toBeInTheDocument())
    expect(screen.queryByText('Τελευταίο αντίγραφο ασφαλείας')).not.toBeInTheDocument()
  })

  it('πρόσφατο backup (<7 μέρες) → ΜΟΝΙΜΟ status banner, ΟΧΙ εξαφάνιση', async () => {
    await setLastBackupAt(recentBackupISO(2))
    renderHome()

    await waitFor(() => expect(screen.getByText('Τελευταίο αντίγραφο ασφαλείας')).toBeInTheDocument())
    expect(screen.queryByText('Δεν έχεις κάνει ποτέ αντίγραφο ασφαλείας.')).not.toBeInTheDocument()
    expect(screen.queryByText(/μέρες από το τελευταίο αντίγραφο ασφαλείας/)).not.toBeInTheDocument()
    // Ημερομηνία ΚΑΙ ώρα, χωρισμένες με «•» (formatDateEl + formatTimeEl).
    expect(screen.getByText(/2026.*•.*\d{2}:\d{2}/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Δημιουργία νέου backup' })).toBeInTheDocument()
  })

  it('overdue backup (>7 μέρες) → ΞΑΝΑ banner προειδοποίησης με αριθμό ημερών, ΟΧΙ status', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    await setLastBackupAt(oldDate)
    renderHome()

    await waitFor(() => expect(screen.getByText(/μέρες από το τελευταίο αντίγραφο ασφαλείας/)).toBeInTheDocument())
    expect(screen.queryByText('Τελευταίο αντίγραφο ασφαλείας')).not.toBeInTheDocument()
  })

  it('κλικ σε «Δημιουργία νέου backup» καλεί το exportBackupFile', async () => {
    await setLastBackupAt(recentBackupISO(2))
    const user = userEvent.setup()
    renderHome()

    const button = await screen.findByRole('button', { name: 'Δημιουργία νέου backup' })
    await user.click(button)

    expect(exportBackupFile).toHaveBeenCalledTimes(1)
  })

  it('αποτυχία exportBackupFile δείχνει μήνυμα σφάλματος, ΔΕΝ πετάει σιωπηλά', async () => {
    await setLastBackupAt(recentBackupISO(2))
    exportBackupFile.mockRejectedValueOnce(new Error('Εσκεμμένο σφάλμα δοκιμής'))
    const user = userEvent.setup()
    renderHome()

    const button = await screen.findByRole('button', { name: 'Δημιουργία νέου backup' })
    await user.click(button)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Εσκεμμένο σφάλμα δοκιμής'))
  })
})

// Mobile review (product polish, σημεία 1+3): με μηδενική δραστηριότητα, η σελίδα έδειχνε ΤΡΙΑ
// «Νέα συνεδρία» ταυτόχρονα σε mobile (κάρτα quick-action, FAB, empty-state CTA) — το empty state
// δεν χρειάζεται πια δικό του, αφού η κάρτα «Νέα συνεδρία» είναι ήδη νωρίτερα στην ΙΔΙΑ σελίδα.
describe('Home — «Πρόσφατη δραστηριότητα» EmptyState χωρίς δικό του CTA', () => {
  it('χωρίς καμία συνεδρία → το empty state δείχνει μόνο κείμενο, ΚΑΝΕΝΑ δικό του «Νέα συνεδρία»', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByText('Δεν υπάρχει ακόμα δραστηριότητα')).toBeInTheDocument())

    // Η κάρτα quick-action ΚΑΙ το mobile FAB «Νέα συνεδρία» παραμένουν (jsdom δεν εφαρμόζει media
    // queries — και τα δύο υπάρχουν πάντα στο DOM, το ένα κρύβεται οπτικά με CSS ανά πλάτος οθόνης).
    expect(screen.getAllByText('Νέα συνεδρία').length).toBeGreaterThan(0)
    // Δεν υπάρχει ΤΡΙΤΟ, ξεχωριστό «Νέα συνεδρία» μέσα στο ίδιο το empty-state block.
    const emptyBlock = screen.getByText('Δεν υπάρχει ακόμα δραστηριότητα').closest('.dashboard-empty')
    expect(within(emptyBlock).queryByText('Νέα συνεδρία')).not.toBeInTheDocument()
  })
})

// Product Design (feedback χρήστη, ΟΧΙ μόνο mobile): «Η μέρα μου» έδειχνε ΤΑΥΤΟΧΡΟΝΑ πληροφορία
// ΚΑΙ ενέργειες («Έκτακτη ατομική/ομαδική» μέσα στην κάρτα) — μετακινήθηκαν στις «Γρήγορες
// ενέργειες», ως δική τους κάρτα, ξεχωριστή από το «Νέα συνεδρία» (διαφορετική ενέργεια: προσθήκη
// στη σειρά για αργότερα, ΟΧΙ άμεση έναρξη Teaching Mode).
describe('Home — «Έκτακτη ατομική/ομαδική» ως global actions (εκτός της κάρτας «Η μέρα μου»)', () => {
  it('εμφανίζονται στις «Γρήγορες ενέργειες», με τα σωστά links, ΟΧΙ μέσα στην κάρτα TodayQueue', async () => {
    renderHome()
    await waitFor(() => expect(screen.getByText('Πρόσθεσε στη μέρα μου')).toBeInTheDocument())

    // «Ατομικό»/«Ομαδικό» εμφανίζονται ΚΑΙ στην κάρτα «Νέα συνεδρία» (διαφορετική ενέργεια) — εδώ
    // ελέγχουμε ΣΥΓΚΕΚΡΙΜΕΝΑ τη νέα κάρτα «Πρόσθεσε στη μέρα μου».
    const card = screen.getByText('Πρόσθεσε στη μέρα μου').closest('.dashboard-action-card')
    const individualLink = within(card).getByRole('link', { name: 'Ατομικό' })
    const groupLink = within(card).getByRole('link', { name: 'Ομαδικό' })
    expect(individualLink).toHaveAttribute('href', '/today/add-individual')
    expect(groupLink).toHaveAttribute('href', '/today/add-group')
    expect(individualLink.closest('.today-queue')).toBeNull()

    expect(screen.queryByText('Έκτακτη ατομική')).not.toBeInTheDocument()
    expect(screen.queryByText('Έκτακτη ομαδική')).not.toBeInTheDocument()
  })
})

// Mobile review (product polish, σημείο 1): το FAB (bottom: nav-height + space-4, ύψος 48px) φτάνει
// ψηλότερα από ό,τι κάλυπτε το .app-shell-main padding-bottom (μόνο nav-height + space-5) — η
// τελευταία γραμμή της «Πρόσφατης δραστηριότητας» κρυβόταν πίσω του. «Καρφώνουμε» εδώ την ίδια τη
// CSS δήλωση (jsdom δεν κάνει πραγματικό layout/overlap measurement).
describe('Home.css: .dashboard-activity έχει επιπλέον mobile margin-bottom ώστε το FAB να μην καλύπτει περιεχόμενο', () => {
  it('.dashboard-activity μέσα στο @media (max-width: 767px) έχει margin-bottom', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/Home.css'), 'utf-8')
    const mobileBlockMatch = css.match(/@media \(max-width: 767px\) \{([\s\S]*)\}\s*$/)
    expect(mobileBlockMatch, 'δεν βρέθηκε το @media (max-width: 767px) block').toBeTruthy()
    const activityMatch = mobileBlockMatch[1].match(/\.dashboard-activity\s*\{([^}]*)\}/)
    expect(activityMatch, '.dashboard-activity δεν βρέθηκε μέσα στο mobile block').toBeTruthy()
    expect(activityMatch[1]).toMatch(/margin-bottom:/)
  })
})
