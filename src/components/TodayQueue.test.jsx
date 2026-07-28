import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import db, { createScheduleSlot, ensureDayGenerated } from '../db.js'
import { todayLocalISO, weekdayOf } from '../utils/date.js'
import TodayQueue from './TodayQueue.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderQueue(props = {}) {
  return render(
    <MemoryRouter>
      <TodayQueue {...props} />
    </MemoryRouter>
  )
}

// Product Design (feedback χρήστη, ΟΧΙ μόνο mobile): «Η μέρα μου» έδειχνε ΤΑΥΤΟΧΡΟΝΑ πληροφορία
// (τι έχω σήμερα) ΚΑΙ ενέργειες (κουμπιά «Έκτακτη ατομική/ομαδική» μέσα στην ίδια κάρτα) — δύο
// ξεχωριστοί ρόλοι στο ίδιο στοιχείο. Η κάρτα δείχνει πλέον ΑΠΟΚΛΕΙΣΤΙΚΑ πληροφορία· οι ενέργειες
// μετακινήθηκαν εκτός της (Home.jsx/DayDetailPage.jsx, βλ. τα αντίστοιχα tests εκεί).
describe('TodayQueue — μόνο πληροφορία, καμία ενέργεια μέσα στην κάρτα', () => {
  it('χωρίς καμία προγραμματισμένη συνεδρία → ΚΑΝΕΝΑ κουμπί «Έκτακτη ατομική/ομαδική» μέσα στην κάρτα', async () => {
    renderQueue()
    await waitFor(() => expect(screen.getByText('Η μέρα μου')).toBeInTheDocument())

    expect(screen.queryByRole('link', { name: /Έκτακτη ατομική/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Έκτακτη ομαδική/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Έκτακτη ατομική')).not.toBeInTheDocument()
    expect(screen.queryByText('Έκτακτη ομαδική')).not.toBeInTheDocument()
  })

  it('ΜΕ ήδη προγραμματισμένες συνεδρίες → επίσης ΚΑΝΕΝΑ κουμπί ενέργειας μέσα στην κάρτα', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await db.dailyQueue.add({ date: '2026-07-21', studentIds: [studentId], order: 0, status: 'pending' })

    renderQueue({ date: '2026-07-21' })
    await waitFor(() => expect(screen.getByText('Μ1')).toBeInTheDocument())

    expect(screen.queryByText('Έκτακτη ατομική')).not.toBeInTheDocument()
    expect(screen.queryByText('Έκτακτη ομαδική')).not.toBeInTheDocument()
  })
})

// Phase 2 Stage B — «Αλλαγή ώρας» μίας ημερομηνίας, από το πραγματικό UI (component-level, όχι μόνο
// db.test.js). Μόνο για γραμμές που προήλθαν από το εβδομαδιαίο πρόγραμμα (scheduleSeriesId !=
// null) — ίδια εξάρτηση με το ήδη υπάρχον «Μετακίνηση σε άλλη μέρα».
describe('TodayQueue — «Αλλαγή ώρας» (Phase 2 Stage B)', () => {
  it('αλλάζει την εμφανιζόμενη ώρα ΜΟΝΟ για σήμερα, χωρίς να αγγίζει το template', async () => {
    const today = todayLocalISO()
    const dow = weekdayOf(today)
    // ΟΧΙ καρφωμένο id=1 — άλλα tests σε αυτό το αρχείο ήδη προσθέτουν μαθητές πριν από αυτό,
    // το auto-increment counter του Dexie ΔΕΝ επαναφέρεται μόνο με db.tables.clear() (βλ. afterEach).
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const seriesId = await createScheduleSlot({ dayOfWeek: dow, startTime: '09:00', durationMinutes: 30, type: 'individual', studentIds: [studentId], label: '' })
    await ensureDayGenerated(today)

    const user = userEvent.setup()
    renderQueue({ date: today })

    await screen.findByText('09:00')
    await user.click(screen.getByRole('button', { name: /Ενέργειες για Μ1/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Αλλαγή ώρας' }))

    const timeInput = await screen.findByLabelText('Νέα ώρα')
    await user.clear(timeInput)
    await user.type(timeInput, '11:00')
    await user.click(screen.getByRole('button', { name: 'Αλλαγή ώρας' }))

    // Το modal button ΚΑΙ το menu item έχουν το ίδιο label «Αλλαγή ώρας» — findByText στη γραμμή
    // επιβεβαιώνει ότι η ΕΜΦΑΝΙΖΟΜΕΝΗ ώρα άλλαξε πραγματικά, όχι απλά ότι το modal έκλεισε.
    await waitFor(async () => expect(await screen.findByText('11:00')).toBeInTheDocument())
    expect(screen.queryByText('09:00')).not.toBeInTheDocument()

    const slots = await db.scheduleSlots.where('seriesId').equals(seriesId).toArray()
    expect(slots).toHaveLength(1)
    expect(slots[0].startTime).toBe('09:00') // το template ΔΕΝ άλλαξε

    const sessionsToday = await db.sessions.where('date').equals(today).toArray()
    expect(sessionsToday).toHaveLength(0) // καμία notHeld — η συνεδρία συνεχίζει να πραγματοποιείται
  })
})

// Responsive QA pass (τελικός συνολικός έλεγχος): «Όχι, θα τη φτιάξω τώρα» + «Ναι» δεν είχαν
// flex-wrap — αρκετά μεγάλο κείμενο ώστε να ρισκάρει οριζόντιο overflow σε στενές οθόνες, ίδιο root
// cause με το παλιότερο, ήδη διορθωμένο bug στο πρώην .today-queue__add-actions. «Καρφώνουμε» εδώ
// την CSS δήλωση (jsdom δεν κάνει πραγματικό layout/overflow measurement).
describe('TodayQueue.css: .today-queue__suggestion-actions δεν ξεχειλίζει σε στενές οθόνες', () => {
  it('flex-wrap:wrap ώστε το μεγάλο «Όχι, θα τη φτιάξω τώρα» να μην ξεχειλίσει', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/TodayQueue.css'), 'utf-8')
    const match = css.match(/\.today-queue__suggestion-actions\s*\{([^}]*)\}/)
    expect(match).toBeTruthy()
    expect(match[1]).toMatch(/flex-wrap:\s*wrap/)
  })
})
