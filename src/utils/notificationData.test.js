import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import db, { dismissNotification, snoozeNotification } from '../db.js'
import { todayLocalISO, addDays } from './date.js'
import { loadNotificationCategories } from './notificationData.js'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('loadNotificationCategories — batched loader (καμία query ανά μαθητή/goal)', () => {
  it('goal stale ενεργού μαθητή εμφανίζεται στο visible, με επισυναπτημένο student', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const today = todayLocalISO()
    const { visible } = await loadNotificationCategories(today)

    const notification = visible.find((n) => n.type === 'goalStale')
    expect(notification).toBeTruthy()
    expect(notification.student.code).toBe('Μ1')
  })

  it('μαθητής ΟΧΙ active → εξαιρείται εντελώς', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: false })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const { visible, snoozed } = await loadNotificationCategories(todayLocalISO())
    expect(visible.find((n) => n.studentId === studentId)).toBeUndefined()
    expect(snoozed.find((n) => n.studentId === studentId)).toBeUndefined()
  })

  it('dismissed notification (persisted state) ΔΕΝ εμφανίζεται πουθενά (ούτε visible ούτε snoozed), αλλά ΠΑΡΑΜΕΝΕΙ στα candidateIds', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const today = todayLocalISO()
    const before = await loadNotificationCategories(today)
    const notification = before.visible.find((n) => n.type === 'goalStale' && n.entityId === goalId)
    expect(notification).toBeTruthy()

    await dismissNotification(notification.id, { type: notification.type, entityType: notification.entityType, entityId: notification.entityId, studentId })

    const after = await loadNotificationCategories(today)
    expect(after.visible.find((n) => n.id === notification.id)).toBeUndefined()
    expect(after.snoozed.find((n) => n.id === notification.id)).toBeUndefined()
    // ΣΗΜΑΝΤΙΚΟ (cleanup, review χρήστη): dismissed ΔΕΝ σημαίνει «όχι πλέον έγκυρο» — το id
    // παραμένει στο candidateIds ώστε το cleanupOrphanedNotificationState να ΜΗΝ το διαγράψει.
    expect(after.candidateIds).toContain(notification.id)
  })

  it('snoozed notification εμφανίζεται στο snoozed (ΟΧΙ στο visible), μετά τη λήξη μεταπηδά στο visible', async () => {
    const studentId = await db.students.add({ code: 'Μ1', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const today = todayLocalISO()
    const before = await loadNotificationCategories(today)
    const notification = before.visible.find((n) => n.type === 'goalStale' && n.entityId === goalId)

    await snoozeNotification(notification.id, addDays(today, 3), { type: notification.type, entityType: notification.entityType, entityId: notification.entityId, studentId })

    const duringSnooze = await loadNotificationCategories(today)
    expect(duringSnooze.visible.find((n) => n.id === notification.id)).toBeUndefined()
    const snoozedEntry = duringSnooze.snoozed.find((n) => n.id === notification.id)
    expect(snoozedEntry).toBeTruthy()
    expect(snoozedEntry.snoozedUntil).toBe(addDays(today, 3))

    const afterSnooze = await loadNotificationCategories(addDays(today, 4))
    expect(afterSnooze.visible.find((n) => n.id === notification.id)).toBeTruthy()
    expect(afterSnooze.snoozed.find((n) => n.id === notification.id)).toBeUndefined()
  })

  it('draft report ενός μαθητή που δεν έχει goals ΕΞΑΚΟΛΟΥΘΕΙ να εμφανίζεται (batched query, καμία εξάρτηση σε goals)', async () => {
    const studentId = await db.students.add({ code: 'Μ2', active: true })
    await db.reports.add({ studentId, type: 'progress', dateFrom: '2026-01-01', dateTo: todayLocalISO(), generatedAt: new Date().toISOString(), editedText: '', status: 'draft', exportedAt: null })

    const { visible } = await loadNotificationCategories(todayLocalISO())
    const notification = visible.find((n) => n.type === 'draftReport')
    expect(notification).toBeTruthy()
    expect(notification.studentId).toBe(studentId)
  })

  it('unresolved past session εμφανίζεται μέσω του ίδιου loader', async () => {
    const studentId = await db.students.add({ code: 'Μ3', active: true })
    const today = todayLocalISO()
    await db.dailyQueue.add({ date: addDays(today, -3), studentIds: [studentId], order: 0, status: 'pending' })

    const { visible } = await loadNotificationCategories(today)
    expect(visible.find((n) => n.type === 'unresolvedSession' && n.studentId === studentId)).toBeTruthy()
  })

  it('visible ταξινομημένο κατά severity — goalStale (warning) πριν από draftReport (info) για τον ΙΔΙΟ μαθητή', async () => {
    const studentId = await db.students.add({ code: 'Μ4', active: true })
    await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Stale', status: 'active', priority: 'high', startDate: '2020-01-01' })
    await db.reports.add({ studentId, type: 'progress', dateFrom: '2026-01-01', dateTo: todayLocalISO(), generatedAt: new Date().toISOString(), editedText: '', status: 'draft', exportedAt: null })

    const { visible } = await loadNotificationCategories(todayLocalISO())
    const types = visible.filter((n) => n.studentId === studentId).map((n) => n.type)
    expect(types).toEqual(['goalStale', 'draftReport'])
  })

  it('candidateIds περιλαμβάνει ΟΛΟΥΣ τους ζωντανά υπολογισμένους ids, ανεξάρτητα από dismiss/snooze', async () => {
    const studentId = await db.students.add({ code: 'Μ5', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })

    const { visible, candidateIds } = await loadNotificationCategories(todayLocalISO())
    const notification = visible.find((n) => n.type === 'goalStale' && n.entityId === goalId)
    expect(candidateIds).toContain(notification.id)
  })

  it('snoozed items επίσης κουβαλάνε επισυναπτημένο student (ίδιο idiom με visible)', async () => {
    const studentId = await db.students.add({ code: 'Μ6', active: true })
    const goalId = await db.goals.add({ studentId, domain: 'communication', title: 'Στόχος Α', status: 'active', priority: 'high', startDate: '2020-01-01' })
    const today = todayLocalISO()
    const before = await loadNotificationCategories(today)
    const notification = before.visible.find((n) => n.type === 'goalStale' && n.entityId === goalId)
    await snoozeNotification(notification.id, addDays(today, 3), { type: notification.type, studentId })

    const { snoozed } = await loadNotificationCategories(today)
    expect(snoozed.find((n) => n.id === notification.id).student.code).toBe('Μ6')
  })
})
