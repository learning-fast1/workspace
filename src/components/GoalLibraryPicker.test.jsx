import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import db from '../db.js'
import { activeTable } from '../migration/activeGeneration.js'
import { DOMAINS } from '../config/domains.js'
import GoalLibraryPicker from './GoalLibraryPicker.jsx'

// Root Cause Investigation (Scenario E) — partial-update fix regression coverage.

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

async function seedTemplate(overrides = {}) {
  return activeTable('goalTemplates').add({
    domain: DOMAINS[0].id, title: 'Πρότυπο Α', description: '', criterion: '8/10', measurementType: 'successRatio',
    ...overrides
  })
}

async function openEditFor(user, title) {
  await user.click(screen.getByRole('button', { name: `Ενέργειες για το πρότυπο ${title}` }))
  await user.click(screen.getByText('Επεξεργασία'))
}

describe('GoalLibraryPicker — partial updates (Root Cause Investigation, Scenario E fix)', () => {
  it('αλλαγή ΜΟΝΟ της περιγραφής στέλνει changeSpec με ΑΚΡΙΒΩΣ ένα key', async () => {
    const id = await seedTemplate({ title: 'Πρότυπο Α' })
    const updateSpy = vi.spyOn(db.table('goalTemplates'), 'update')

    const user = userEvent.setup()
    render(<GoalLibraryPicker open onClose={vi.fn()} onApply={vi.fn()} isDirty={false} />)
    await screen.findByText('Πρότυπο Α')
    await openEditFor(user, 'Πρότυπο Α')
    await user.type(screen.getByLabelText('Περιγραφή', { exact: false }), 'Νέα περιγραφή')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalled())
    expect(updateSpy).toHaveBeenCalledWith(id, { description: 'Νέα περιγραφή' })
    updateSpy.mockRestore()
  })

  it('δύο ανεξάρτητα partial updates στο ΙΔΙΟ πρότυπο διατηρούν και τις δύο αλλαγές', async () => {
    const id = await seedTemplate({ title: 'Τ', criterion: '8/10' })

    await activeTable('goalTemplates').update(id, { title: 'Νέος τίτλος από Α' })
    await activeTable('goalTemplates').update(id, { criterion: '9/10' })

    const row = await activeTable('goalTemplates').get(id)
    expect(row.title).toBe('Νέος τίτλος από Α')
    expect(row.criterion).toBe('9/10')
  })
})
