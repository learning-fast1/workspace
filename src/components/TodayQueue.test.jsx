import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import db from '../db.js'
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
