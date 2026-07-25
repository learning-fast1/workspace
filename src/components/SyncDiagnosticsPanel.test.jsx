import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth.js', () => ({ default: () => mockUseAuth() }))

const mockGetCachedGeneration = vi.fn()
vi.mock('../migration/activeGeneration.js', () => ({
  getCachedGeneration: (...args) => mockGetCachedGeneration(...args)
}))

const mockGetLegacyDataOwner = vi.fn()
vi.mock('../migration/legacyOwnership.js', () => ({
  getLegacyDataOwner: (...args) => mockGetLegacyDataOwner(...args)
}))

const mockCheckSyncPrerequisites = vi.fn()
const mockIsSessionSyncActive = vi.fn()
vi.mock('../migration/syncAuthorization.js', () => ({
  checkSyncPrerequisites: (...args) => mockCheckSyncPrerequisites(...args),
  isSessionSyncActive: (...args) => mockIsSessionSyncActive(...args)
}))

// Mockάρουμε ολόκληρο το StudentList.jsx (ΟΧΙ μόνο το loadStudentsWithStats) ώστε το test αυτού του
// panel να μην τραβάει μέσα του όλο το StudentList component tree (AppShell/PageHeader/κ.λπ.) — το
// panel χρησιμοποιεί ΑΠΟΚΛΕΙΣΤΙΚΑ την exported συνάρτηση, ΠΟΤΕ το ίδιο το component.
const mockLoadStudentsWithStats = vi.fn()
vi.mock('./StudentList.jsx', () => ({
  loadStudentsWithStats: (...args) => mockLoadStudentsWithStats(...args)
}))

// Ίδιο μοτίβο ελέγχου read-only: ΚΑΘΕ write-ικανή μέθοδο (configure/sync/login/add/put/update/
// delete) την κάνουμε spy ώστε ένα ενδεχόμενο, κατά λάθος write να ΣΠΑΕΙ το test αντί να περνάει
// αθόρυβα — το panel πρέπει να μένει ΑΥΣΤΗΡΑ αναγνωστικό σε ΟΛΗ τη διάρκεια render+αλληλεπίδρασης.
// vi.hoisted: το vi.mock('../db.js', ...) παρακάτω ανεβαίνει στην κορυφή του αρχείου (hoisting) —
// οι μεταβλητές που χρησιμοποιεί μέσα στο factory πρέπει να δηλωθούν ΕΔΩ, όχι ως απλά top-level const.
const { configureSpy, syncSpy, loginSpy, studentsV2Table, mutationsTable, mockDb } = vi.hoisted(() => {
  const configureSpy = vi.fn()
  const syncSpy = vi.fn()
  const loginSpy = vi.fn()

  const studentsV2Table = {
    count: vi.fn().mockResolvedValue(3),
    where: vi.fn(() => ({ equals: vi.fn(() => ({ first: vi.fn().mockResolvedValue(null) })) })),
    add: vi.fn(), put: vi.fn(), update: vi.fn(), delete: vi.fn()
  }
  const mutationsTable = {
    count: vi.fn().mockResolvedValue(0),
    add: vi.fn(), put: vi.fn(), update: vi.fn(), delete: vi.fn()
  }

  const mockDb = {
    cloud: {
      currentUser: { value: { userId: 'user-abc-123', isLoggedIn: true } },
      syncState: { value: { phase: 'in-sync', status: 'connected', error: null } },
      persistedSyncState: {
        value: {
          initiallySynced: true,
          serverRevision: 42,
          yServerRevision: 7,
          realms: ['rlm-1'],
          inviteRealms: []
        }
      },
      configure: configureSpy,
      sync: syncSpy,
      login: loginSpy
    },
    table: vi.fn((name) => {
      if (name === 'students_v2') return studentsV2Table
      if (name === '$students_v2_mutations') return mutationsTable
      throw new Error(`unexpected table: ${name}`)
    })
  }

  return { configureSpy, syncSpy, loginSpy, studentsV2Table, mutationsTable, mockDb }
})
vi.mock('../db.js', () => ({ default: mockDb, CLOUD_ENABLED: true }))

import SyncDiagnosticsPanel from './SyncDiagnosticsPanel.jsx'

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SyncDiagnosticsPanel />
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ status: 'loggedIn', email: 'δασκάλα@example.com', userId: 'user-abc-123' })
  mockGetCachedGeneration.mockReturnValue('v2')
  mockGetLegacyDataOwner.mockResolvedValue({ userId: 'user-abc-123' })
  mockCheckSyncPrerequisites.mockResolvedValue({ ok: true, reason: null })
  mockIsSessionSyncActive.mockReturnValue(true)
  mockLoadStudentsWithStats.mockResolvedValue([{ id: 's1' }, { id: 's2' }])
})

function getDiagRowValue(label) {
  const th = screen.getByText(label)
  return th.nextElementSibling.textContent
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SyncDiagnosticsPanel', () => {
  it('χωρίς ?diag=1 στο URL → δεν αποδίδει τίποτα, καμία κλήση', async () => {
    const { container } = renderAt('/settings')
    await new Promise((r) => setTimeout(r, 0))
    expect(container).toBeEmptyDOMElement()
    expect(mockDb.table).not.toHaveBeenCalled()
  })

  it('με ?diag=1 → αποδίδει τις αναμενόμενες τιμές διαγνωστικών', async () => {
    renderAt('/settings?diag=1')
    expect(await screen.findByText('δασκάλα@example.com')).toBeInTheDocument()
    expect(screen.getAllByText('user-abc-123', { selector: 'td' }).length).toBeGreaterThan(0)
    expect(screen.getByText('in-sync')).toBeInTheDocument()
    expect(screen.getAllByText('true', { selector: 'td' }).length).toBeGreaterThan(0)
    expect(screen.getByText('v2')).toBeInTheDocument()
    expect(screen.getByText('rlm-1')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // students_v2 count
    expect(getDiagRowValue('StudentList query result count')).toBe('2')
  })

  it('StudentList query result count — καλεί ΤΗΝ ΙΔΙΑ loadStudentsWithStats() που χρησιμοποιεί το StudentList, δείχνει σφάλμα αν πετάξει', async () => {
    mockLoadStudentsWithStats.mockRejectedValueOnce(new Error('boom'))
    renderAt('/settings?diag=1')
    await screen.findByText('δασκάλα@example.com')
    await waitFor(() => expect(getDiagRowValue('StudentList query result count')).toMatch(/σφάλμα: Error: boom/))
  })

  it('δεν εμφανίζει ονόματα/σημειώσεις μαθητών στον πίνακα διαγνωστικών — μόνο τα ρητά πεδία', async () => {
    renderAt('/settings?diag=1')
    await screen.findByText('δασκάλα@example.com')
    const table = document.querySelector('.sync-diagnostics-panel__table')
    expect(table).not.toHaveTextContent(/σημείωση/i)
    expect(table).not.toHaveTextContent(/αξιολόγηση/i)
  })

  it('κουμπί «Ανανέωση διαγνωστικών» ξανατρέχει τα read-only queries', async () => {
    const user = userEvent.setup()
    renderAt('/settings?diag=1')
    await screen.findByText('δασκάλα@example.com')
    const initialCalls = studentsV2Table.count.mock.calls.length

    await user.click(screen.getByRole('button', { name: /Ανανέωση διαγνωστικών/ }))

    await waitFor(() => expect(studentsV2Table.count.mock.calls.length).toBeGreaterThan(initialCalls))
  })

  it('έλεγχος κωδικού μαθητή — βρέθηκε τοπικά', async () => {
    studentsV2Table.where.mockReturnValueOnce({
      equals: vi.fn(() => ({ first: vi.fn().mockResolvedValue({ id: 'row-1', code: 'Μ1' }) }))
    })
    const user = userEvent.setup()
    renderAt('/settings?diag=1')
    await screen.findByText('δασκάλα@example.com')

    await user.type(screen.getByLabelText(/Έλεγχος κωδικού μαθητή/), 'Μ1')
    await user.click(screen.getByRole('button', { name: 'Έλεγχος' }))

    expect(await screen.findByText(/Βρέθηκε τοπικά/)).toBeInTheDocument()
  })

  it('έλεγχος κωδικού μαθητή — δεν βρέθηκε', async () => {
    const user = userEvent.setup()
    renderAt('/settings?diag=1')
    await screen.findByText('δασκάλα@example.com')

    await user.type(screen.getByLabelText(/Έλεγχος κωδικού μαθητή/), 'ΑΓΝΩΣΤΟΣ')
    await user.click(screen.getByRole('button', { name: 'Έλεγχος' }))

    expect(await screen.findByText('Δεν βρέθηκε τοπικά.')).toBeInTheDocument()
  })

  it('ΠΟΤΕ δεν καλεί write-ικανές μεθόδους (configure/sync/login/add/put/update/delete) σε render + αλληλεπιδράσεις', async () => {
    const user = userEvent.setup()
    renderAt('/settings?diag=1')
    await screen.findByText('δασκάλα@example.com')
    await user.click(screen.getByRole('button', { name: /Ανανέωση διαγνωστικών/ }))
    await user.type(screen.getByLabelText(/Έλεγχος κωδικού μαθητή/), 'Μ1')
    await user.click(screen.getByRole('button', { name: 'Έλεγχος' }))

    expect(configureSpy).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
    expect(loginSpy).not.toHaveBeenCalled()
    expect(studentsV2Table.add).not.toHaveBeenCalled()
    expect(studentsV2Table.put).not.toHaveBeenCalled()
    expect(studentsV2Table.update).not.toHaveBeenCalled()
    expect(studentsV2Table.delete).not.toHaveBeenCalled()
    expect(mutationsTable.add).not.toHaveBeenCalled()
    expect(mutationsTable.put).not.toHaveBeenCalled()
    expect(mutationsTable.update).not.toHaveBeenCalled()
    expect(mutationsTable.delete).not.toHaveBeenCalled()
  })
})
