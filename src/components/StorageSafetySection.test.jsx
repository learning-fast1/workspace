import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockGetStorageStatus = vi.fn()
const mockRequestPersistentStorage = vi.fn()
vi.mock('../utils/storagePersistence.js', () => ({
  getStorageStatus: (...args) => mockGetStorageStatus(...args),
  requestPersistentStorage: (...args) => mockRequestPersistentStorage(...args)
}))
import StorageSafetySection from './StorageSafetySection.jsx'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StorageSafetySection', () => {
  it('active → μήνυμα επιτυχίας, ΚΑΝΕΝΑ κουμπί αιτήματος, ΚΑΝΕΝΑ CTA backup, ΠΑΝΤΑ η υπενθύμιση backup', async () => {
    mockGetStorageStatus.mockResolvedValue('active')
    render(<StorageSafetySection />)

    expect(await screen.findByText('Η μόνιμη αποθήκευση είναι ενεργή σε αυτή τη συσκευή.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ζήτησε μόνιμη αποθήκευση' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Πήγαινε στο αντίγραφο ασφαλείας' })).not.toBeInTheDocument()
    expect(screen.getByText(/τακτικό αντίγραφο ασφαλείας παραμένει απαραίτητο/)).toBeInTheDocument()
  })

  it('requestable → κουμπί αιτήματος, κλικ καλεί requestPersistentStorage και ενημερώνει την κατάσταση', async () => {
    mockGetStorageStatus.mockResolvedValue('requestable')
    mockRequestPersistentStorage.mockResolvedValue('active')
    const user = userEvent.setup()
    render(<StorageSafetySection />)

    const button = await screen.findByRole('button', { name: 'Ζήτησε μόνιμη αποθήκευση' })
    await user.click(button)

    await waitFor(() => expect(mockRequestPersistentStorage).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Η μόνιμη αποθήκευση είναι ενεργή σε αυτή τη συσκευή.')).toBeInTheDocument()
  })

  it('requestable → αίτημα απορρίπτεται (denied) → CTA backup εμφανίζεται, ΚΑΝΕΝΑ κουμπί αιτήματος πια', async () => {
    mockGetStorageStatus.mockResolvedValue('requestable')
    mockRequestPersistentStorage.mockResolvedValue('denied')
    const user = userEvent.setup()
    render(<StorageSafetySection />)

    await user.click(await screen.findByRole('button', { name: 'Ζήτησε μόνιμη αποθήκευση' }))

    expect(await screen.findByText('Ο browser αρνήθηκε το αίτημα μόνιμης αποθήκευσης.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ζήτησε μόνιμη αποθήκευση' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Πήγαινε στο αντίγραφο ασφαλείας' })).toBeInTheDocument()
  })

  it('unsupported → CTA backup εμφανίζεται', async () => {
    mockGetStorageStatus.mockResolvedValue('unsupported')
    render(<StorageSafetySection />)
    expect(await screen.findByText('Αυτός ο browser δεν υποστηρίζει μόνιμη αποθήκευση.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Πήγαινε στο αντίγραφο ασφαλείας' })).toBeInTheDocument()
  })

  it('error → CTA backup εμφανίζεται', async () => {
    mockGetStorageStatus.mockResolvedValue('error')
    render(<StorageSafetySection />)
    expect(await screen.findByText('Δεν ήταν δυνατός ο έλεγχος μόνιμης αποθήκευσης.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Πήγαινε στο αντίγραφο ασφαλείας' })).toBeInTheDocument()
  })

  it('CTA backup κάνει scrollIntoView στην ενότητα #backup-section, ΚΑΜΙΑ πλοήγηση/hash change', async () => {
    mockGetStorageStatus.mockResolvedValue('denied')
    const scrollSpy = vi.fn()
    const backupSection = document.createElement('div')
    backupSection.id = 'backup-section'
    backupSection.scrollIntoView = scrollSpy
    document.body.appendChild(backupSection)

    const user = userEvent.setup()
    render(<StorageSafetySection />)
    await user.click(await screen.findByRole('button', { name: 'Πήγαινε στο αντίγραφο ασφαλείας' }))

    expect(scrollSpy).toHaveBeenCalledTimes(1)
    document.body.removeChild(backupSection)
  })
})
