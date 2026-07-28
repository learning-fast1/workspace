import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FunctionalProfileEditor from './FunctionalProfileEditor.jsx'
import { FUNCTIONAL_PROFILE_DOMAINS } from '../config/functionalProfileDomains.js'

afterEach(() => cleanup())

// Απόφαση χρήστη (Απλοποίηση τομέων στόχων): το Λειτουργικό Προφίλ ΔΕΝ ακολουθεί τη νέα, 8-τομέων
// ταξινόμηση στόχων — μένει στους 14 αναλυτικούς, βλ. config/functionalProfileDomains.js. Αυτό το
// test επιβεβαιώνει ότι η αλλαγή του config/domains.js (οι 8 τομείς στόχων) δεν επηρέασε καθόλου
// αυτό το component.
describe('FunctionalProfileEditor — παραμένει στους 14 αναλυτικούς τομείς (αποσύνδεση από τους τομείς στόχων)', () => {
  it('εμφανίζει και τους 14 τομείς στην πλοήγηση (desktop/tablet nav)', () => {
    render(<FunctionalProfileEditor functionalProfile={[]} onChange={vi.fn()} />)

    const nav = screen.getByRole('navigation', { name: 'Τομείς λειτουργικού προφίλ' })
    for (const { name } of FUNCTIONAL_PROFILE_DOMAINS) {
      expect(within(nav).getByText(name)).toBeInTheDocument()
    }
    expect(within(nav).getAllByRole('button')).toHaveLength(14)
  })

  it('ΔΕΝ εμφανίζει καμία από τις νέες, απλοποιημένες ονομασίες τομέων στόχων', () => {
    render(<FunctionalProfileEditor functionalProfile={[]} onChange={vi.fn()} />)

    const nav = screen.getByRole('navigation', { name: 'Τομείς λειτουργικού προφίλ' })
    expect(within(nav).queryByText('Επικοινωνία')).not.toBeInTheDocument()
    expect(within(nav).queryByText('Γνωστικές & Εκτελεστικές λειτουργίες')).not.toBeInTheDocument()
    expect(within(nav).queryByText('Κινητική')).not.toBeInTheDocument()
  })

  it('οι υπάρχουσες επιλογές του profileOptions.js παραμένουν διαθέσιμες (π.χ. Λεπτή κινητικότητα)', async () => {
    const user = userEvent.setup()
    render(<FunctionalProfileEditor functionalProfile={[]} onChange={vi.fn()} />)

    const nav = screen.getByRole('navigation', { name: 'Τομείς λειτουργικού προφίλ' })
    await user.click(within(nav).getByText('Λεπτή κινητικότητα'))

    expect(screen.getByText('Τριποδική λαβή')).toBeInTheDocument()
    expect(screen.getByText('Χειρισμός ψαλιδιού')).toBeInTheDocument()
  })

  it('ήδη αποθηκευμένο functionalProfile (παλιά, αναλυτικά ids) εμφανίζεται σωστά', () => {
    const functionalProfile = [{ domain: 'reading', checkedOptions: ['Διαβάζει συλλαβές'], notes: 'Σημείωση' }]
    render(<FunctionalProfileEditor functionalProfile={functionalProfile} onChange={vi.fn()} />)

    const nav = screen.getByRole('navigation', { name: 'Τομείς λειτουργικού προφίλ' })
    // Badge με τον αριθμό επιλεγμένων στοιχείων δίπλα στο «Ανάγνωση».
    const readingButton = within(nav).getByText('Ανάγνωση').closest('button')
    expect(within(readingButton).getByText('1')).toBeInTheDocument()
  })
})

// Mobile review (product polish, σημείο 5) — οι γραμμές accordion ήταν πιο ψηλές από όσο χρειάζεται.
// «Καρφώνουμε» εδώ τη CSS δήλωση (jsdom δεν κάνει πραγματικό layout/ύψος measurement).
describe('FunctionalProfileEditor.css: accordion header — πιο συμπαγές, ΠΑΝΤΑ ≥44px touch target', () => {
  it('.profile-editor__accordion-header έχει min-height 48px (όχι πια 52px), min-height ≥ 44px (a11y)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/FunctionalProfileEditor.css'), 'utf-8')
    const match = css.match(/\.profile-editor__accordion-header\s*\{([^}]*)\}/)
    expect(match).toBeTruthy()
    const minHeightMatch = match[1].match(/min-height:\s*(\d+)px/)
    expect(minHeightMatch).toBeTruthy()
    expect(Number(minHeightMatch[1])).toBeGreaterThanOrEqual(44)
    expect(Number(minHeightMatch[1])).toBeLessThan(52)
  })
})
