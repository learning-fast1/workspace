import { describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach } from 'vitest'
import WeeklyScheduleGrid from './WeeklyScheduleGrid.jsx'

afterEach(() => cleanup())

const studentById = { 1: { id: 1, code: 'Μ1' }, 2: { id: 2, code: 'Μ2' } }

function slot({ id, seriesId, dayOfWeek = 1, startTime, durationMinutes, studentIds = [1] }) {
  return { id, seriesId: seriesId ?? id, dayOfWeek, startTime, durationMinutes, studentIds, type: studentIds.length > 1 ? 'group' : 'individual', label: '' }
}

describe('WeeklyScheduleGrid — read-only πλέγμα (καμία δική του query, καμία εξάρτηση από scheduleExceptions/resolver)', () => {
  it('εμφανίζει ένα slot με πλήρες, προσβάσιμο label (ενέργεια + μαθητής + ημέρα + ώρα + διάρκεια)', () => {
    const slots = [slot({ id: 1, dayOfWeek: 1, startTime: '09:00', durationMinutes: 30 })]
    render(<WeeklyScheduleGrid slots={slots} studentById={studentById} selectedDay={1} onEditSlot={() => {}} />)

    const block = screen.getByRole('button', { name: /Επεξεργασία: Μ1, Δευτέρα 09:00, 30′/ })
    expect(block).toBeInTheDocument()
  })

  it('ομαδικό slot εμφανίζει και τους δύο κωδικούς στο label', () => {
    const slots = [slot({ id: 1, dayOfWeek: 2, startTime: '10:00', durationMinutes: 45, studentIds: [1, 2] })]
    render(<WeeklyScheduleGrid slots={slots} studentById={studentById} selectedDay={2} onEditSlot={() => {}} />)

    expect(screen.getByRole('button', { name: /Μ1, Μ2/ })).toBeInTheDocument()
  })

  it('κλικ σε block καλεί onEditSlot με ΤΟ σωστό slot — καμία νέα interaction semantics', async () => {
    const onEditSlot = vi.fn()
    const theSlot = slot({ id: 7, dayOfWeek: 1, startTime: '11:00', durationMinutes: 30 })
    const user = userEvent.setup()
    render(<WeeklyScheduleGrid slots={[theSlot]} studentById={studentById} selectedDay={1} onEditSlot={onEditSlot} />)

    await user.click(screen.getByRole('button', { name: /Επεξεργασία/ }))
    expect(onEditSlot).toHaveBeenCalledWith(theSlot)
  })

  it('πληκτρολόγιο: Tab φτάνει στο block, Enter το ενεργοποιεί (φυσική συμπεριφορά <button>)', async () => {
    const onEditSlot = vi.fn()
    const theSlot = slot({ id: 7, dayOfWeek: 1, startTime: '11:00', durationMinutes: 30 })
    const user = userEvent.setup()
    render(<WeeklyScheduleGrid slots={[theSlot]} studentById={studentById} selectedDay={1} onEditSlot={onEditSlot} />)

    await user.tab()
    expect(screen.getByRole('button', { name: /Επεξεργασία/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onEditSlot).toHaveBeenCalledWith(theSlot)
  })

  it('πληκτρολόγιο: Space ενεργοποιεί επίσης το block', async () => {
    const onEditSlot = vi.fn()
    const theSlot = slot({ id: 7, dayOfWeek: 1, startTime: '11:00', durationMinutes: 30 })
    const user = userEvent.setup()
    render(<WeeklyScheduleGrid slots={[theSlot]} studentById={studentById} selectedDay={1} onEditSlot={onEditSlot} />)

    await user.tab()
    await user.keyboard(' ')
    expect(onEditSlot).toHaveBeenCalledWith(theSlot)
  })

  it('δεν έχει role="grid" ούτε custom ARIA grid keyboard model', () => {
    const slots = [slot({ id: 1, dayOfWeek: 1, startTime: '09:00', durationMinutes: 30 })]
    const { container } = render(<WeeklyScheduleGrid slots={slots} studentById={studentById} selectedDay={1} onEditSlot={() => {}} />)
    expect(container.querySelector('[role="grid"]')).toBeNull()
  })

  it('επικαλυπτόμενα slots εμφανίζονται ΚΑΙ τα δύο, side-by-side (καμία πλήρης κάλυψη)', () => {
    const slots = [
      slot({ id: 1, dayOfWeek: 1, startTime: '09:00', durationMinutes: 30 }),
      slot({ id: 2, dayOfWeek: 1, startTime: '09:15', durationMinutes: 30, studentIds: [2] })
    ]
    render(<WeeklyScheduleGrid slots={slots} studentById={studentById} selectedDay={1} onEditSlot={() => {}} />)

    const blockA = screen.getByRole('button', { name: /Μ1, Δευτέρα 09:00/ })
    const blockB = screen.getByRole('button', { name: /Μ2, Δευτέρα 09:15/ })
    expect(blockA).toBeInTheDocument()
    expect(blockB).toBeInTheDocument()
    expect(blockA.style.left).not.toBe(blockB.style.left)
    expect(blockA.style.width).toBe('50%')
    expect(blockB.style.width).toBe('50%')
  })

  it('άδεια εβδομάδα (κανένα slot) δεν κρασάρει — εμφανίζει τους τίτλους ημερών χωρίς κανένα block', () => {
    render(<WeeklyScheduleGrid slots={[]} studentById={{}} selectedDay={1} onEditSlot={() => {}} />)
    expect(screen.getByText('Δευτέρα')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Επεξεργασία/ })).not.toBeInTheDocument()
  })

  it('η επιλεγμένη ημέρα ΔΕΝ έχει την κλάση --inactive, οι υπόλοιπες ΝΑΙ (μηχανισμός mobile/tablet single-day)', () => {
    const { container } = render(<WeeklyScheduleGrid slots={[]} studentById={{}} selectedDay={2} onEditSlot={() => {}} />)
    const days = container.querySelectorAll('.weekly-grid__day')
    const inactiveCount = container.querySelectorAll('.weekly-grid__day--inactive').length
    expect(days).toHaveLength(5)
    expect(inactiveCount).toBe(4)
  })
})
