import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import db from '../db.js'
import DayDetailPage from './DayDetailPage.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderPage(date) {
  return render(
    <MemoryRouter initialEntries={[`/schedule/day/${date}`]}>
      <Routes>
        <Route path="/schedule/day/:date" element={<DayDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

// Product Design (feedback χρήστη): «Έκτακτη ατομική/ομαδική» μετακινήθηκαν εκτός της κάρτας
// TodayQueue — εδώ (DayDetailPage) αποδίδονται πλέον από τη σελίδα, πάνω από την κάρτα, με το ίδιο
// date-aware URL scheme με πριν (addToQueueLinks, utils/dailyQueue.js).
describe('DayDetailPage — «Έκτακτη ατομική/ομαδική» εκτός της κάρτας TodayQueue', () => {
  it('μη-σημερινή μέρα → τα links περιέχουν ?date=', async () => {
    renderPage('2026-08-03')
    await waitFor(() => expect(screen.getByRole('link', { name: /Έκτακτη ατομική/ })).toBeInTheDocument())

    const individualLink = screen.getByRole('link', { name: /Έκτακτη ατομική/ })
    const groupLink = screen.getByRole('link', { name: /Έκτακτη ομαδική/ })
    expect(individualLink).toHaveAttribute('href', '/today/add-individual?date=2026-08-03')
    expect(groupLink).toHaveAttribute('href', '/today/add-group?date=2026-08-03')

    // Εκτός της κάρτας TodayQueue (.today-queue) — δικές τους, ξεχωριστές ενέργειες της σελίδας.
    expect(individualLink.closest('.today-queue')).toBeNull()
    expect(groupLink.closest('.today-queue')).toBeNull()
  })
})
