import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import db from '../../db.js'
import HeaderSearch from './HeaderSearch.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

function renderSearch() {
  return render(
    <MemoryRouter>
      <HeaderSearch />
    </MemoryRouter>
  )
}

async function seedBasicData() {
  const studentId = await db.students.add({ code: 'Μ1', nickname: 'Γιώργος', grade: 'Β Δημοτικού', active: true })
  await db.goals.add({ studentId, domain: 'communication', title: 'Άρθρωση /ρ/', status: 'active', priority: 'high', startDate: '2026-01-01' })
  return studentId
}

describe('HeaderSearch — βασική ροή πληκτρολόγησης/αποτελεσμάτων', () => {
  it('πληκτρολόγηση δείχνει ομαδοποιημένα αποτελέσματα (accent-insensitive)', async () => {
    await seedBasicData()
    const user = userEvent.setup()
    renderSearch()

    const input = screen.getByRole('combobox', { name: /Αναζήτηση μαθητών/ })
    await user.click(input)
    await user.type(input, 'αρθρωση')

    await waitFor(() => expect(screen.getByText('Στόχοι')).toBeInTheDocument())
    expect(screen.getByText('Άρθρωση /ρ/')).toBeInTheDocument()
  })

  it('κενό αποτέλεσμα δείχνει empty state με το query', async () => {
    await seedBasicData()
    const user = userEvent.setup()
    renderSearch()

    const input = screen.getByRole('combobox', { name: /Αναζήτηση μαθητών/ })
    await user.click(input)
    await user.type(input, 'ζζζζανύπαρκτο')

    await waitFor(() => expect(screen.getByText(/Κανένα αποτέλεσμα για/)).toBeInTheDocument())
  })

  it('κλικ σε αποτέλεσμα πλοηγεί ΚΑΙ καθαρίζει το query (ephemeral, όχι μόνιμο)', async () => {
    await seedBasicData()
    const user = userEvent.setup()
    renderSearch()

    const input = screen.getByRole('combobox', { name: /Αναζήτηση μαθητών/ })
    await user.click(input)
    await user.type(input, 'Μ1')

    const option = await screen.findByRole('option', { name: /Μ1 — Γιώργος/ })
    await user.click(option)

    await waitFor(() => expect(input).toHaveValue(''))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('HeaderSearch — keyboard navigation', () => {
  it('ArrowDown/Enter πλοηγεί στο highlighted αποτέλεσμα', async () => {
    await seedBasicData()
    const user = userEvent.setup()
    renderSearch()

    const input = screen.getByRole('combobox', { name: /Αναζήτηση μαθητών/ })
    await user.click(input)
    await user.type(input, 'Μ1')
    await screen.findByRole('option', { name: /Μ1/ })

    await user.keyboard('{Enter}')
    await waitFor(() => expect(input).toHaveValue(''))
  })

  it('Escape κλείνει το dropdown', async () => {
    await seedBasicData()
    const user = userEvent.setup()
    renderSearch()

    const input = screen.getByRole('combobox', { name: /Αναζήτηση μαθητών/ })
    await user.click(input)
    await user.type(input, 'Μ1')
    await screen.findByRole('listbox')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })
})

describe('HeaderSearch — click εκτός κλείνει το desktop dropdown', () => {
  it('click σε στοιχείο εκτός κλείνει', async () => {
    await seedBasicData()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <div>
          <HeaderSearch />
          <button type="button">Εκτός</button>
        </div>
      </MemoryRouter>
    )

    const input = screen.getByRole('combobox', { name: /Αναζήτηση μαθητών/ })
    await user.click(input)
    await user.type(input, 'Μ1')
    await screen.findByRole('listbox')

    await user.click(screen.getByRole('button', { name: 'Εκτός' }))
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })
})

describe('HeaderSearch — mobile overlay', () => {
  it('trigger εικονιδίου ανοίγει overlay με «Άκυρο», που καθαρίζει και κλείνει', async () => {
    await seedBasicData()
    const user = userEvent.setup()
    renderSearch()

    await user.click(screen.getByRole('button', { name: 'Αναζήτηση' }))
    expect(screen.getByRole('dialog', { name: 'Αναζήτηση' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Άκυρο' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
