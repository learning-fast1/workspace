import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import db from '../db.js'
import DisplayNameSection from './DisplayNameSection.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('DisplayNameSection', () => {
  it('χωρίς αποθηκευμένο όνομα → κενό πεδίο', async () => {
    render(<DisplayNameSection />)
    await waitFor(() => expect(screen.getByLabelText('Όνομα')).toHaveValue(''))
  })

  it('με ήδη αποθηκευμένο όνομα → το πεδίο σπέρνεται με αυτό', async () => {
    await db.userSettings.put({ key: 'displayName', value: 'Όλγα', updatedAt: '2026-01-01T00:00:00.000Z' })
    render(<DisplayNameSection />)
    await waitFor(() => expect(screen.getByLabelText('Όνομα')).toHaveValue('Όλγα'))
  })

  it('πληκτρολόγηση + Αποθήκευση → γράφει στη βάση, δείχνει επιβεβαίωση', async () => {
    const user = userEvent.setup()
    render(<DisplayNameSection />)

    await user.type(screen.getByLabelText('Όνομα'), 'Μαρία')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(() => expect(screen.getByText('Αποθηκεύτηκε.')).toBeInTheDocument())
    expect((await db.userSettings.get('displayName')).value).toBe('Μαρία')
  })

  it('κενό όνομα (trim) αποθηκεύεται ως κενό string, ΟΧΙ σφάλμα', async () => {
    const user = userEvent.setup()
    render(<DisplayNameSection />)

    await user.type(screen.getByLabelText('Όνομα'), '   ')
    await user.click(screen.getByRole('button', { name: 'Αποθήκευση' }))

    await waitFor(() => expect(screen.getByText('Αποθηκεύτηκε.')).toBeInTheDocument())
    expect((await db.userSettings.get('displayName')).value).toBe('')
  })
})
