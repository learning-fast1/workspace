import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import db from '../db.js'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth.js', () => ({ default: () => mockUseAuth() }))

import TeacherProfileSection from './TeacherProfileSection.jsx'

beforeEach(async () => {
  await db.open()
  mockUseAuth.mockReturnValue({ status: 'disabled', email: null })
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
  vi.clearAllMocks()
})

describe('TeacherProfileSection', () => {
  it('χωρίς καμία αποθηκευμένη ρύθμιση → κενά πεδία, κουμπί Αποθήκευση disabled', async () => {
    render(<TeacherProfileSection />)

    await waitFor(() => expect(screen.getByLabelText('Όνομα εμφάνισης')).toHaveValue(''))
    expect(screen.getByLabelText('Σχολείο')).toHaveValue('')
    expect(screen.getByLabelText('Ειδικότητα')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Αποθήκευση' })).toBeDisabled()
  })

  it('με ήδη αποθηκευμένες τιμές → τα 3 πεδία σπέρνονται σωστά', async () => {
    await db.userSettings.bulkPut([
      { key: 'displayName', value: 'Όλγα', updatedAt: '2026-01-01T00:00:00.000Z' },
      { key: 'schoolName', value: '3ο Δημοτικό Λευκωσίας', updatedAt: '2026-01-01T00:00:00.000Z' },
      { key: 'specialty', value: 'Λογοθεραπεύτρια', updatedAt: '2026-01-01T00:00:00.000Z' }
    ])
    render(<TeacherProfileSection />)

    await waitFor(() => expect(screen.getByLabelText('Όνομα εμφάνισης')).toHaveValue('Όλγα'))
    expect(screen.getByLabelText('Σχολείο')).toHaveValue('3ο Δημοτικό Λευκωσίας')
    expect(screen.getByLabelText('Ειδικότητα')).toHaveValue('Λογοθεραπεύτρια')
    expect(screen.getByRole('button', { name: 'Αποθήκευση' })).toBeDisabled()
  })

  it('χωρίς σύνδεση → ΚΑΝΕΝΑ πεδίο Email', async () => {
    render(<TeacherProfileSection />)
    await screen.findByLabelText('Όνομα εμφάνισης')
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('συνδεδεμένη → πεδίο Email read-only με το πραγματικό email', async () => {
    mockUseAuth.mockReturnValue({ status: 'loggedIn', email: 'olga@example.gr' })
    render(<TeacherProfileSection />)

    await screen.findByLabelText('Όνομα εμφάνισης')
    expect(screen.getByText('olga@example.gr')).toBeInTheDocument()
  })

  it('πληκτρολόγηση ενεργοποιεί το κουμπί (isDirty), αποθήκευση γράφει και τα 3 πεδία', async () => {
    const user = userEvent.setup()
    render(<TeacherProfileSection />)

    await screen.findByLabelText('Όνομα εμφάνισης')
    const saveButton = screen.getByRole('button', { name: 'Αποθήκευση' })
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByLabelText('Όνομα εμφάνισης'), 'Μαρία')
    expect(saveButton).toBeEnabled()

    await user.type(screen.getByLabelText('Σχολείο'), 'Σχολείο Α')
    await user.type(screen.getByLabelText('Ειδικότητα'), 'Ψυχολόγος')
    await user.click(saveButton)

    await waitFor(() => expect(screen.getByText('Αποθηκεύτηκε.')).toBeInTheDocument())
    expect((await db.userSettings.get('displayName')).value).toBe('Μαρία')
    expect((await db.userSettings.get('schoolName')).value).toBe('Σχολείο Α')
    expect((await db.userSettings.get('specialty')).value).toBe('Ψυχολόγος')
  })

  it('μετά από επιτυχή αποθήκευση, το κουμπί ξαναγίνεται disabled (καμία εκκρεμής αλλαγή)', async () => {
    const user = userEvent.setup()
    render(<TeacherProfileSection />)

    await user.type(await screen.findByLabelText('Όνομα εμφάνισης'), 'Μαρία')
    const saveButton = screen.getByRole('button', { name: 'Αποθήκευση' })
    await user.click(saveButton)

    await waitFor(() => expect(saveButton).toBeDisabled())
  })

  it('ζωντανή προεπισκόπηση χαιρετισμού ενημερώνεται καθώς πληκτρολογεί, χωρίς κόμμα όταν κενό', async () => {
    const user = userEvent.setup()
    render(<TeacherProfileSection />)

    expect(await screen.findByText(/«Καλημέρα»/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Όνομα εμφάνισης'), 'Μαρία')
    expect(await screen.findByText(/«Καλημέρα, Μαρία»/)).toBeInTheDocument()
  })

  it('κενό όνομα (μόνο κενά) → trim σε κενό string, ΟΧΙ σφάλμα', async () => {
    const user = userEvent.setup()
    render(<TeacherProfileSection />)

    await user.type(await screen.findByLabelText('Όνομα εμφάνισης'), '   ')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(() => expect(screen.getByText('Αποθηκεύτηκε.')).toBeInTheDocument())
    expect((await db.userSettings.get('displayName')).value).toBe('')
  })
})
