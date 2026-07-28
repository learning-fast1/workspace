import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import db, { dismissNotification, snoozeNotification } from '../db.js'
import { todayLocalISO, addDays } from './date.js'
import { loadNotifications } from './notificationData.js'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('loadNotifications — batched loader (καμία query ανά μαθητή/goal)', () => {
  it('goal stale ενεργού μαθητή εμφανίζεται, με επισυναπτημένο student', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const today = todayLocalISO()
    const { items } = await loadNotifications(today)

    const notification = items.find((n) => n.type === 'goalStale')
    expect(notification).toBeTruthy()
    expect(notification.student.code).toBe('Μ1')
  })

  it('μαθητής ΟΧΙ active → εξαιρείται εντελώς', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: false })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const { items } = await loadNotifications(todayLocalISO())
    expect(items.find((n) => n.studentId === studentId)).toBeUndefined()
  })

  it('dismissed notification (persisted state) ΔΕΝ εμφανίζεται στα items, αλλά ΠΑΡΑΜΕΝΕΙ στα candidateIds', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const today = todayLocalISO()
    const before = await loadNotifications(today)
    const notification = before.items.find((n) => n.type === 'goalStale' && n.entityId === goalId)
    expect(notification).toBeTruthy()

    await dismissNotification(notification.id, { type: notification.type, entityType: notification.entityType, entityId: notification.entityId, studentId })

    const after = await loadNotifications(today)
    expect(after.items.find((n) => n.id === notification.id)).toBeUndefined()
    // ΣΗΜΑΝΤΙΚΟ (cleanup, review χρήστη): dismissed ΔΕΝ σημαίνει «όχι πλέον έγκυρο» — το id
    // παραμένει στο candidateIds ώστε το cleanupOrphanedNotificationState να ΜΗΝ το διαγράψει.
    expect(after.candidateIds).toContain(notification.id)
  })

  it('snoozed notification με μελλοντικό snoozedUntil ΔΕΝ εμφανίζεται, μετά τη λήξη ΞΑΝΑγίνεται ορατή', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const today = todayLocalISO()
    const before = await loadNotifications(today)
    const notification = before.items.find((n) => n.type === 'goalStale' && n.entityId === goalId)

    await snoozeNotification(notification.id, addDays(today, 3), { type: notification.type, entityType: notification.entityType, entityId: notification.entityId, studentId })

    const duringSnooze = await loadNotifications(today)
    expect(duringSnooze.items.find((n) => n.id === notification.id)).toBeUndefined()

    const afterSnooze = await loadNotifications(addDays(today, 4))
    expect(afterSnooze.items.find((n) => n.id === notification.id)).toBeTruthy()
  })

  it('draft report ενός μαθητή που δεν έχει goals ΕΞΑΚΟΛΟΥΘΕΙ να εμφανίζεται (batched query, καμία εξάρτηση σε goals)', async () => {
    const studentId = await db.students.add({ code: 'Μ2', active: true })
    await db.reports.add({ studentId, type: 'progress', dateFrom: '2026-01-01', dateTo: todayLocalISO(), generatedAt: new Date().toISOString(), editedText: '', status: 'draft', exportedAt: null })

    const { items } = await loadNotifications(todayLocalISO())
    const notification = items.find((n) => n.type === 'draftReport')
    expect(notification).toBeTruthy()
    expect(notification.studentId).toBe(studentId)
  })

  it('unresolved past session εμφανίζεται μέσω του ίδιου loader', async () => {
    const studentId = await db.students.add({ code: 'Μ3', active: true })
    const today = todayLocalISO()
    await db.dailyQueue.add({ date: addDays(today, -3), studentIds: [studentId], order: 0, status: 'pending' })

    const { items } = await loadNotifications(today)
    expect(items.find((n) => n.type === 'unresolvedSession' && n.studentId === studentId)).toBeTruthy()
  })

  it('ταξινομημένο κατά severity — goalStale (warning) πριν από draftReport (info) για τον ΙΔΙΟ μαθητή', async () => {
    const studentId = await db.students.add({ code: 'Μ4', active: true })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Stale', status: 'active', priority: 'high', startDate: '2020-01-01' })
    await db.reports.add({ studentId, type: 'progress', dateFrom: '2026-01-01', dateTo: todayLocalISO(), generatedAt: new Date().toISOString(), editedText: '', status: 'draft', exportedAt: null })

    const { items } = await loadNotifications(todayLocalISO())
    const types = items.filter((n) => n.studentId === studentId).map((n) => n.type)
    expect(types).toEqual(['goalStale', 'draftReport'])
  })

  it('candidateIds περιλαμβάνει ΟΛΟΥΣ τους ζωντανά υπολογισμένους ids, ανεξάρτητα από dismiss/snooze', async () => {
    const studentId = await db.students.add({ code: 'Μ5', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const { items, candidateIds } = await loadNotifications(todayLocalISO())
    const notification = items.find((n) => n.type === 'goalStale' && n.entityId === goalId)
    expect(candidateIds).toContain(notification.id)
  })
})
