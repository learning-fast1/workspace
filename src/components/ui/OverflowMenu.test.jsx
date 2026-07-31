import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OverflowMenu from './OverflowMenu.jsx'

afterEach(() => cleanup())

describe('OverflowMenu — προεπιλεγμένη συμπεριφορά (ίδια με πριν, καμία αλλαγή)', () => {
  it('χωρίς renderTrigger → δείχνει το προεπιλεγμένο MoreVertical trigger, ανοίγει/κλείνει με click', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<OverflowMenu items={[{ label: 'Επεξεργασία', onClick }]} />)

    const trigger = screen.getByRole('button', { name: 'Περισσότερες ενέργειες' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'true')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Επεξεργασία' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('Escape κλείνει και επιστρέφει focus στο trigger', async () => {
    const user = userEvent.setup()
    render(<OverflowMenu items={[{ label: 'Διαγραφή', onClick: vi.fn(), variant: 'danger' }]} />)

    const trigger = screen.getByRole('button', { name: 'Περισσότερες ενέργειες' })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('click εκτός κλείνει το menu', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <OverflowMenu items={[{ label: 'Κάτι', onClick: vi.fn() }]} />
        <button type="button">Εκτός</button>
      </div>
    )
    await user.click(screen.getByRole('button', { name: 'Περισσότερες ενέργειες' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Εκτός' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('OverflowMenu — γενίκευση (renderTrigger/triggerClassName, Header user-menu)', () => {
  it('renderTrigger αντικαθιστά το markup του trigger, ΙΔΙΑ interaction λογική', async () => {
    const user = userEvent.setup()
    render(
      <OverflowMenu
        items={[{ label: 'Ρυθμίσεις', onClick: vi.fn() }]}
        ariaLabel="Προφίλ — Όλγα"
        renderTrigger={({ open }) => <span>Όλγα {open ? '▲' : '▼'}</span>}
        triggerClassName="app-shell-user-menu"
      />
    )
    const trigger = screen.getByRole('button', { name: 'Προφίλ — Όλγα' })
    expect(trigger).toHaveTextContent('Όλγα ▼')
    expect(trigger.className).toContain('overflow-menu__trigger')
    expect(trigger.className).toContain('app-shell-user-menu')

    await user.click(trigger)
    expect(trigger).toHaveTextContent('Όλγα ▲')
    expect(screen.getByRole('menuitem', { name: 'Ρυθμίσεις' })).toBeInTheDocument()
  })
})
