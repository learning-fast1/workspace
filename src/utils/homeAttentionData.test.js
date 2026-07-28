import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import db from '../db.js'
import { loadHomeAttentionItems } from './homeAttentionData.js'

const TODAY = new Date('2026-07-15T12:00:00.000Z')

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

async function seedStudent(overrides = {}) {
  return db.students.add({ code: 'Μ' + Math.random().toString(36).slice(2, 6), active: true, ...overrides })
}

async function seedGoal(studentId, overrides = {}) {
  return db.goals.add({ studentId, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'medium', startDate: '2026-01-01', criterion: '8/10', measurementType: 'successRatio', ...overrides })
}

describe('loadHomeAttentionItems (Technical Plan Στάδιο 13)', () => {
  it('ένα goal με πολλαπλούς λόγους (nearCriterion + stale) εμφανίζεται ΜΙΑ φορά, όχι μία ανά λόγο', async () => {
    const studentId = await seedStudent()
    // Πρόσφατη μέτρηση κοντά στο criterion 80% (nearCriterion) αλλά ΠΑΛΙΑ ημερομηνία (>14 μέρες, stale).
    const goalId = await seedGoal(studentId, { startDate: '2026-01-01' })
    const sessionId = await db.sessions.add({ date: '2026-06-20', studentIds: [studentId], status: 'held' })
    await db.measurements.add({ studentId, goalId, sessionId, value: { successes: 75, attempts: 100 } })

    const items = await loadHomeAttentionItems(TODAY)
    const forThisGoal = items.filter((i) => i.goalId === goalId)
    expect(forThisGoal).toHaveLength(1)
    expect(forThisGoal[0].reasons.map((r) => r.type).sort()).toEqual(['nearCriterion', 'stale'])
  })

  it('deterministic σειρά — stale πριν pausedTooLong πριν nearCriterion, ίδια με το goalAttention.js', async () => {
    const s1 = await seedStudent()
    const staleGoal = await seedGoal(s1, { startDate: '2026-01-01' }) // stale, καμία μέτρηση
    const nearGoal = await seedGoal(s1, { startDate: '2026-07-14' })
    const sessionId = await db.sessions.add({ date: '2026-07-14', studentIds: [s1], status: 'held' })
    await db.measurements.add({ studentId: s1, goalId: nearGoal, sessionId, value: { successes: 75, attempts: 100 } })

    const items = await loadHomeAttentionItems(TODAY)
    const ids = items.map((i) => i.goalId)
    expect(ids.indexOf(staleGoal)).toBeLessThan(ids.indexOf(nearGoal))
  })

  it('αρχειοθετημένος μαθητής ΔΕΝ εμφανίζεται, ακόμα κι αν έχει goal που θα ήταν stale', async () => {
    const studentId = await seedStudent({ active: false })
    await seedGoal(studentId, { startDate: '2026-01-01' })

    const items = await loadHomeAttentionItems(TODAY)
    expect(items.some((i) => i.studentId === studentId)).toBe(false)
  })

  it('achieved/archived goal ΔΕΝ εμφανίζεται ποτέ', async () => {
    const studentId = await seedStudent()
    await seedGoal(studentId, { status: 'achieved', startDate: '2026-01-01' })
    await seedGoal(studentId, { status: 'archived', startDate: '2026-01-01' })

    const items = await loadHomeAttentionItems(TODAY)
    expect(items).toHaveLength(0)
  })

  it('paused goal εμφανίζεται ΜΟΝΟ όταν είναι pausedTooLong (>42 μέρες), όχι απλά επειδή είναι paused', async () => {
    const studentId = await seedStudent()
    const recentlyPaused = await seedGoal(studentId, { status: 'paused', startDate: '2026-01-01' })
    await db.goalEvents.add({ goalId: recentlyPaused, at: '2026-07-01T00:00:00.000Z', type: 'statusChanged', fromStatus: 'active', toStatus: 'paused', note: '', trigger: 'manual' })

    const longPaused = await seedGoal(studentId, { status: 'paused', startDate: '2025-01-01' })
    await db.goalEvents.add({ goalId: longPaused, at: '2026-01-01T00:00:00.000Z', type: 'statusChanged', fromStatus: 'active', toStatus: 'paused', note: '', trigger: 'manual' })

    const items = await loadHomeAttentionItems(TODAY)
    expect(items.some((i) => i.goalId === recentlyPaused)).toBe(false)
    expect(items.some((i) => i.goalId === longPaused)).toBe(true)
  })

  it('κάθε item έχει ήδη επισυναπτόμενο student/goal — το widget δεν χρειάζεται δεύτερη αναζήτηση', async () => {
    const studentId = await seedStudent({ code: 'ΑΒ12' })
    const goalId = await seedGoal(studentId, { title: 'Ανάγνωση προτάσεων', startDate: '2026-01-01' })

    const items = await loadHomeAttentionItems(TODAY)
    const item = items.find((i) => i.goalId === goalId)
    expect(item.student.code).toBe('ΑΒ12')
    expect(item.goal.title).toBe('Ανάγνωση προτάσεων')
  })

  it('μηδέν ενεργοί μαθητές/στόχοι → άδειο array, όχι throw', async () => {
    expect(await loadHomeAttentionItems(TODAY)).toEqual([])
  })

  it('ΑΚΡΙΒΩΣ 5 IndexedDB operations, ανεξάρτητα από αριθμό μαθητών/στόχων (σημείο 7)', async () => {
    for (let i = 0; i < 6; i++) {
      const studentId = await seedStudent()
      await seedGoal(studentId, { startDate: '2026-01-01' })
      await seedGoal(studentId, { startDate: '2026-01-01' })
    }

    // Sprint 5A Phase 2, Commit 4B — loadHomeAttentionItems πλέον διαβάζει μέσω activeTable(name)
    // (=db.table(name)), το οποίο η Dexie κρατά ως ΞΕΧΩΡΙΣΤΟ αντικείμενο Table από το db.<name>
    // property (ίδιο underlying .core, διαφορετικό instance) — το spy πρέπει να στοχεύει ΤΟ ΙΔΙΟ
    // αντικείμενο που θα χρησιμοποιήσει ο πραγματικός κώδικας.
    const spies = [
      vi.spyOn(db.table('students'), 'toArray'),
      vi.spyOn(db.table('goals'), 'toArray'),
      vi.spyOn(db.table('sessions'), 'toArray'),
      vi.spyOn(db.table('measurements'), 'toArray'),
      vi.spyOn(db.table('goalEvents'), 'toArray')
    ]

    try {
      await loadHomeAttentionItems(TODAY)
      const totalCalls = spies.reduce((sum, s) => sum + s.mock.calls.length, 0)
      expect(totalCalls).toBe(5)
      for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spies.forEach((s) => s.mockRestore())
    }
  })
})
