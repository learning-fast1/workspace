import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setUpdateAvailable } from '../pwaUpdate.js'
import PwaUpdateBanner from './PwaUpdateBanner.jsx'

afterEach(() => cleanup())

describe('PwaUpdateBanner', () => {
  it('χωρίς διαθέσιμη ενημέρωση → αποδίδει ΤΙΠΟΤΑ', () => {
    render(<PwaUpdateBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('μετά από setUpdateAvailable → εμφανίζεται, κλικ «Ανανέωση» καλεί το updateSW(true)', async () => {
    const updateSW = vi.fn()
    const user = userEvent.setup()
    render(<PwaUpdateBanner />)

    setUpdateAvailable(updateSW)

    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent('Νέα έκδοση της εφαρμογής είναι διαθέσιμη.')

    await user.click(screen.getByRole('button', { name: /Ανανέωση/ }))
    expect(updateSW).toHaveBeenCalledWith(true)
  })
})
