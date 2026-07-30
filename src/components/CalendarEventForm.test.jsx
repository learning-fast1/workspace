import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import db from '../db.js'
import { activeTable } from '../migration/activeGeneration.js'
import CalendarEventForm from './CalendarEventForm.jsx'

// Root Cause Investigation (Scenario E) — partial-update fix regression coverage.

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('CalendarEventForm — partial updates (Root Cause Investigation, Scenario E fix)', () => {
  it('αλλαγή ΜΟΝΟ της σημείωσης στέλνει changeSpec με ΑΚΡΙΒΩΣ ένα key', async () => {
    const eventId = await activeTable('calendarEvents').add({
      date: '2026-03-01', title: 'Σχολική γιορτή', category: null, startTime: null, note: ''
    })
    const event = await activeTable('calendarEvents').get(eventId)
    const updateSpy = vi.spyOn(db.table('calendarEvents'), 'update')

    const user = userEvent.setup()
    render(<CalendarEventForm date="2026-03-01" event={event} onClose={vi.fn()} onSaved={vi.fn()} />)
    await user.type(screen.getByLabelText('Σημείωση', { exact: false }), 'Μια σημείωση')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(updateSpy).toHaveBeenCalledWith(eventId, { note: 'Μια σημείωση' })
    updateSpy.mockRestore()
  })

  it('κενό/αμετάβλητο category (null) ΔΕΝ δημιουργεί ψευδές diff όταν αλλάζει μόνο ο τίτλος', async () => {
    const eventId = await activeTable('calendarEvents').add({
      date: '2026-03-01', title: 'Αρχικός τίτλος', category: null, startTime: null, note: ''
    })
    const event = await activeTable('calendarEvents').get(eventId)
    const updateSpy = vi.spyOn(db.table('calendarEvents'), 'update')

    const user = userEvent.setup()
    render(<CalendarEventForm date="2026-03-01" event={event} onClose={vi.fn()} onSaved={vi.fn()} />)
    await user.clear(screen.getByLabelText('Τίτλος', { exact: false }))
    await user.type(screen.getByLabelText('Τίτλος', { exact: false }), 'Νέος τίτλος')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(updateSpy).toHaveBeenCalledWith(eventId, { title: 'Νέος τίτλος' })
    updateSpy.mockRestore()
  })

  it('δύο ανεξάρτητα partial updates στο ΙΔΙΟ γεγονός διατηρούν και τις δύο αλλαγές', async () => {
    const eventId = await activeTable('calendarEvents').add({
      date: '2026-03-01', title: 'Τ', category: null, startTime: null, note: ''
    })

    await activeTable('calendarEvents').update(eventId, { title: 'Νέος τίτλος από Α' })
    await activeTable('calendarEvents').update(eventId, { note: 'Σημείωση από Β' })

    const row = await activeTable('calendarEvents').get(eventId)
    expect(row.title).toBe('Νέος τίτλος από Α')
    expect(row.note).toBe('Σημείωση από Β')
  })
})
