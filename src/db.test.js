import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import db, { migrateDomainNamesToIds, ensureDomainTemplatesSeeded } from './db.js'
import { DOMAIN_IDS } from './config/domains.js'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  db.close()
})

describe('migrateDomainNamesToIds', () => {
  it('μετατρέπει παλιά ελληνική ονομασία τομέα σε id σε goal', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'Ανάγνωση', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('reading')
  })

  it('δεν αγγίζει goal που έχει ήδη έγκυρο id', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'reading', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('reading')
  })

  it('μετατρέπει το functionalProfile μαθητή', async () => {
    const studentId = await db.students.add({
      code: 'Μ1',
      active: true,
      functionalProfile: [{ domain: 'Γραπτός λόγος', checkedOptions: [], notes: '' }],
      preferences: {}
    })
    await migrateDomainNamesToIds()
    const student = await db.students.get(studentId)
    expect(student.functionalProfile[0].domain).toBe('writing')
  })

  it('μετατρέπει το κλειδί ενός domainTemplate χωρίς να χάνει το περιεχόμενό του', async () => {
    await db.domainTemplates.put({ domain: 'Μαθηματικά', goalStarters: ['Παράδειγμα στόχου'] })
    await migrateDomainNamesToIds()
    const migrated = await db.domainTemplates.get('math')
    const old = await db.domainTemplates.get('Μαθηματικά')
    expect(migrated).toBeTruthy()
    expect(migrated.goalStarters).toEqual(['Παράδειγμα στόχου'])
    expect(old).toBeUndefined()
  })

  it('αφήνει άγνωστο τομέα ως έχει αντί να τον σβήσει', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'Κάτι Ανύπαρκτο', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('Κάτι Ανύπαρκτο')
  })

  it('είναι ασφαλές να τρέξει πολλές φορές στα ίδια δεδομένα', async () => {
    const goalId = await db.goals.add({ studentId: 1, domain: 'Ανάγνωση', title: 'Στόχος', status: 'active', priority: 'high' })
    await migrateDomainNamesToIds()
    await migrateDomainNamesToIds()
    const goal = await db.goals.get(goalId)
    expect(goal.domain).toBe('reading')
  })
})

describe('ensureDomainTemplatesSeeded', () => {
  it('δημιουργεί ένα template ανά τομέα της σταθερής λίστας', async () => {
    await ensureDomainTemplatesSeeded()
    const templates = await db.domainTemplates.toArray()
    const ids = templates.map((t) => t.domain).sort()
    expect(ids).toEqual([...DOMAIN_IDS].sort())
  })

  it('δεν αγγίζει υπάρχον template', async () => {
    await db.domainTemplates.put({ domain: 'reading', goalStarters: ['Προσαρμοσμένη πρόταση'] })
    await ensureDomainTemplatesSeeded()
    const template = await db.domainTemplates.get('reading')
    expect(template.goalStarters).toEqual(['Προσαρμοσμένη πρόταση'])
  })
})
