import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import db, { dismissNotification } from '../../db.js'
import { todayLocalISO } from '../../utils/date.js'
import { NotificationsProvider, useNotifications } from './NotificationsProvider.jsx'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

// Δύο ξεχωριστοί «καταναλωτές» μέσα στον ΙΔΙΟ provider — προσομοιώνει Header + HomeAttentionWidget
// (ή Header + Inbox) μοιράζοντας ΤΟ ΙΔΙΟ computed dataset (review χρήστη, σημείο 1).
function CountConsumer() {
  const { status, visible } = useNotifications()
  if (status !== 'ok') return <span data-testid="count">…</span>
  return <span data-testid="count">{visible.length}</span>
}

function ListConsumer() {
  const { status, visible, snoozed } = useNotifications()
  if (status !== 'ok') return <span data-testid="list">…</span>
  return <span data-testid="list">visible={visible.length} snoozed={snoozed.length}</span>
}

function renderTwoConsumers() {
  return render(
    <NotificationsProvider>
      <CountConsumer />
      <ListConsumer />
    </NotificationsProvider>
  )
}

describe('NotificationsProvider — κοινό, μοιρασμένο notification dataset', () => {
  it('useNotifications() ΕΞΩ από provider πετάει σαφές σφάλμα', () => {
    // Καταστέλλει το React error-log θορύβου γι' αυτό το ΑΝΑΜΕΝΟΜΕΝΟ throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Bare() {
      useNotifications()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/useNotifications\(\).*NotificationsProvider/)
    spy.mockRestore()
  })

  it('δύο καταναλωτές μέσα στον ΙΔΙΟ provider βλέπουν το ΙΔΙΟ αποτέλεσμα (μία φόρτωση, όχι ανεξάρτητες)', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    renderTwoConsumers()

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    expect(screen.getByTestId('list')).toHaveTextContent('visible=1 snoozed=0')
  })

  it('dismiss ενημερώνει ΚΑΙ τους δύο καταναλωτές αυτόματα (Dexie live-query invalidation, καμία χειροκίνητη ενέργεια)', async () => {
    const studentId = await db.students.add({ code: 'Μ2', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Β', status: 'active', priority: 'high', startDate: '2020-01-01' })

    renderTwoConsumers()
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))

    await dismissNotification(`goalStale:${goalId}:2020-01-01`, { type: 'goalStale', studentId, entityType: 'goal', entityId: goalId })

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'))
    expect(screen.getByTestId('list')).toHaveTextContent('visible=0 snoozed=0')
  })

  it('cleanupOrphanedNotificationState τρέχει αυτόματα (goal διαγράφηκε → dismissed state row καθαρίζεται)', async () => {
    const studentId = await db.students.add({ code: 'Μ3', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Γ', status: 'active', priority: 'high', startDate: '2020-01-01' })
    await dismissNotification(`goalStale:${goalId}:2020-01-01`, { type: 'goalStale', studentId, entityType: 'goal', entityId: goalId })

    renderTwoConsumers()
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'))

    await db.goals.delete(goalId)
    await waitFor(async () => {
      expect(await db.notificationState.get(`goalStale:${goalId}:2020-01-01`)).toBeUndefined()
    })
  })
})
