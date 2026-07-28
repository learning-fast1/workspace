import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import db, { createScheduleSlot, ensureDayGenerated } from '../db.js'
import { todayLocalISO, weekdayOf, addDays } from '../utils/date.js'
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

// Phase 2 Stage A — εμπλουτισμός της Daily Queue (utils/queueAttention.js): goal attention
// (goalAttention.js, reuse), «μη ολοκληρωμένη προηγούμενη συνεδρία» (νέο) και «πρόχειρη αναφορά»
// (reports.status==='draft', νέο). Component-level, από το πραγματικό UI — τα καθαρά unit tests
// των υπολογισμών ζουν στο utils/queueAttention.test.js.
describe('TodayQueue — Stage A: εμπλουτισμός με goal attention / unresolved session / draft report', () => {
  it('goal attention (goalAttention.js reuse) — stale goal εμφανίζεται ως compact badge, κλικ ανοίγει τη λεπτομέρεια', async () => {
    const today = todayLocalISO()
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })
    await db.dailyQueue.add({ date: today, studentIds: [studentId], order: 0, status: 'pending' })

    const user = userEvent.setup()
    renderQueue({ date: today })

    const badge = await screen.findByRole('button', { name: /Χωρίς μέτρηση/ })
    expect(badge).toHaveAttribute('aria-expanded', 'false')

    await user.click(badge)
    expect(badge).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('list')).toBeInTheDocument()
  })

  it('«μη ολοκληρωμένη προηγούμενη συνεδρία» — συνοπτική ένδειξη με ΠΛΗΘΟΣ, όχι μία ανά παλιά εγγραφή', async () => {
    const today = todayLocalISO()
    const studentId = await db.students.add({ code: 'Γ1', active: true })
    await db.dailyQueue.add({ date: addDays(today, -3), studentIds: [studentId], order: 0, status: 'pending' })
    await db.dailyQueue.add({ date: addDays(today, -6), studentIds: [studentId], order: 0, status: 'pending' })
    await db.dailyQueue.add({ date: today, studentIds: [studentId], order: 0, status: 'pending' })

    renderQueue({ date: today })

    expect(await screen.findByRole('button', { name: /2 εκκρεμείς προηγούμενες συνεδρίες/ })).toBeInTheDocument()
  })

  it('παλιά εγγραφή που είναι ρητά «Παράλειψη σήμερα» (status: skipped) ΔΕΝ μετράει ως εκκρεμότητα', async () => {
    const today = todayLocalISO()
    const studentId = await db.students.add({ code: 'Ζ1', active: true })
    await db.dailyQueue.add({ date: addDays(today, -3), studentIds: [studentId], order: 0, status: 'skipped' })
    await db.dailyQueue.add({ date: today, studentIds: [studentId], order: 0, status: 'pending' })

    renderQueue({ date: today })

    await screen.findByText('Ζ1')
    expect(screen.queryByRole('button', { name: /εκκρεμ/i })).not.toBeInTheDocument()
  })

  it('ομαδική γραμμή — aggregation ΑΝΑ μαθητή, κάθε reason στη λεπτομέρεια αναφέρει καθαρά τον μαθητή του', async () => {
    const today = todayLocalISO()
    const studentA = await db.students.add({ code: 'Α1', active: true })
    const studentB = await db.students.add({ code: 'Β1', active: true })
    await db.goals.add({ studentId: studentA, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })
    await db.reports.add({ studentId: studentB, type: 'progress', dateFrom: '2026-01-01', dateTo: today, generatedAt: new Date().toISOString(), editedText: '', status: 'draft', exportedAt: null })
    await db.dailyQueue.add({ date: today, studentIds: [studentA, studentB], order: 0, status: 'pending' })

    const user = userEvent.setup()
    renderQueue({ date: today })

    const badge = await screen.findByRole('button', { name: /Χωρίς μέτρηση|Πρόχειρη αναφορά/ })
    await user.click(badge)

    const list = await screen.findByRole('list')
    expect(within(list).getByText(/Α1:.*Χωρίς μέτρηση/)).toBeInTheDocument()
    expect(within(list).getByText(/Β1:.*Πρόχειρη αναφορά/)).toBeInTheDocument()
  })

  it('καμία ένδειξη badge όταν δεν υπάρχει κανένας λόγος', async () => {
    const today = todayLocalISO()
    const studentId = await db.students.add({ code: 'Δ1', active: true })
    await db.dailyQueue.add({ date: today, studentIds: [studentId], order: 0, status: 'pending' })

    renderQueue({ date: today })

    await screen.findByText('Δ1')
    expect(screen.queryByRole('button', { name: /Χωρίς μέτρηση|Πρόχειρη αναφορά|Εκκρεμ|Σε παύση/ })).not.toBeInTheDocument()
  })

  it('η βασική ροή έναρξης συνεδρίας ΔΕΝ αλλάζει όταν υπάρχει attention badge στη γραμμή', async () => {
    const today = todayLocalISO()
    const studentId = await db.students.add({ code: 'Ε1', active: true })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος', status: 'active', priority: 'high', startDate: '2020-01-01' })
    await db.dailyQueue.add({ date: today, studentIds: [studentId], order: 0, status: 'pending' })

    renderQueue({ date: today })

    expect(await screen.findByRole('button', { name: /Ξεκίνα συνεδρία — Ε1/ })).toBeInTheDocument()
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
