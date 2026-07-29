import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { version } from '../../package.json'
import ApplicationSection from './ApplicationSection.jsx'

afterEach(() => {
  cleanup()
})

describe('ApplicationSection', () => {
  it('δείχνει την πραγματική έκδοση από το package.json', () => {
    render(<ApplicationSection />)
    expect(screen.getByText(`Έκδοση ${version}`)).toBeInTheDocument()
  })

  it('δείχνει πληροφορία offline/PWA και απόρρητο', () => {
    render(<ApplicationSection />)
    expect(screen.getByText(/Λειτουργεί πλήρως offline/)).toBeInTheDocument()
    expect(screen.getByText(/εξουσιοδότηση από το σχολείο/)).toBeInTheDocument()
  })
})
