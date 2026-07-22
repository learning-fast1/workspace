import { describe, expect, it } from 'vitest'
import { buildParticipationDecisions, buildGoalDecisions, summarizeTransition } from './schoolYearTransitionPayload.js'

describe('buildParticipationDecisions', () => {
  it('μετατρέπει το map σε array αποφάσεων, studentId ως αριθμό', () => {
    const result = buildParticipationDecisions({ 1: 'continued', 2: 'departed' })
    expect(result).toEqual([
      { studentId: 1, status: 'continued', reason: '' },
      { studentId: 2, status: 'departed', reason: '' }
    ])
  })

  it('άδειο map → άδειο array', () => {
    expect(buildParticipationDecisions({})).toEqual([])
  })
})

describe('buildGoalDecisions', () => {
  const goals = [
    { id: 1, studentId: 10, domain: 'reading', title: 'Α', criterion: '8/10', measurementType: 'successRatio', priority: 'high' },
    { id: 2, studentId: 10, domain: 'math', title: 'Β', criterion: '5/5', measurementType: 'successRatio', priority: 'medium' },
    { id: 3, studentId: 20, domain: 'writing', title: 'Γ', criterion: '3/3', measurementType: 'successRatio', priority: 'low' }
  ]

  it('αποχωρών μαθητής (departed) ΔΕΝ παράγει goal decisions για κανέναν από τους στόχους του (σημείο 6)', () => {
    const participation = { 10: 'departed', 20: 'continued' }
    const result = buildGoalDecisions(goals, {}, participation, '2026-09-01')
    expect(result).toHaveLength(1)
    expect(result[0].goalId).toBe(3)
  })

  it('στόχος χωρίς ρητή απόφαση → προεπιλογή "continue" (ασφαλής προεπιλογή, σημείο 5)', () => {
    const participation = { 10: 'continued', 20: 'continued' }
    const result = buildGoalDecisions(goals, {}, participation, '2026-09-01')
    expect(result.every((d) => d.decision === 'continue')).toBe(true)
    expect(result).toHaveLength(3)
  })

  it('"achieved" περνάει αυτούσιο, χωρίς newGoalFields', () => {
    const participation = { 10: 'continued' }
    const goalDecisions = { 1: { decision: 'achieved' } }
    const result = buildGoalDecisions([goals[0]], goalDecisions, participation, '2026-09-01')
    expect(result).toEqual([{ goalId: 1, studentId: 10, decision: 'achieved' }])
  })

  it('"newGoal": φτιάχνει newGoalFields από τον παλιό στόχο, τίτλος από newGoalTitle, startDate = νέο έτος', () => {
    const participation = { 10: 'continued' }
    const goalDecisions = { 1: { decision: 'newGoal', newGoalTitle: 'Νέος τίτλος' } }
    const result = buildGoalDecisions([goals[0]], goalDecisions, participation, '2026-09-01')
    expect(result).toEqual([{
      goalId: 1, studentId: 10, decision: 'newGoal',
      newGoalFields: {
        domain: 'reading', title: 'Νέος τίτλος', description: '', criterion: '8/10',
        measurementType: 'successRatio', supportLevel: '', priority: 'high', startDate: '2026-09-01'
      }
    }])
  })

  it('"newGoal" χωρίς newGoalTitle → πέφτει πίσω στον τίτλο του παλιού στόχου', () => {
    const participation = { 10: 'continued' }
    const goalDecisions = { 1: { decision: 'newGoal' } }
    const result = buildGoalDecisions([goals[0]], goalDecisions, participation, '2026-09-01')
    expect(result[0].newGoalFields.title).toBe('Α')
  })

  it('"newGoal" με μόνο κενά ως τίτλο → trimmed σε κενό string (το backend θα το απορρίψει, όχι δική μας ευθύνη εδώ)', () => {
    const participation = { 10: 'continued' }
    const goalDecisions = { 1: { decision: 'newGoal', newGoalTitle: '   ' } }
    const result = buildGoalDecisions([goals[0]], goalDecisions, participation, '2026-09-01')
    expect(result[0].newGoalFields.title).toBe('')
  })
})

describe('summarizeTransition', () => {
  const students = [{ id: 10 }, { id: 20 }, { id: 30 }]
  const goals = [
    { id: 1, studentId: 10 },
    { id: 2, studentId: 10 },
    { id: 3, studentId: 20 },
    { id: 4, studentId: 30 }
  ]

  it('μετράει σωστά continued/departed μαθητές', () => {
    const participation = { 10: 'continued', 20: 'departed', 30: 'continued' }
    const result = summarizeTransition(students, [], participation, {})
    expect(result.continuedCount).toBe(2)
    expect(result.departedCount).toBe(1)
  })

  it('μαθητής χωρίς ρητή participation μετράει ως continued (ασφαλής προεπιλογή)', () => {
    const result = summarizeTransition(students, [], {}, {})
    expect(result.continuedCount).toBe(3)
    expect(result.departedCount).toBe(0)
  })

  it('goals αποχωρούντων μαθητών ΔΕΝ μετράνε σε καμία από τις 3 κατηγορίες (συμφωνία με buildGoalDecisions)', () => {
    const participation = { 10: 'departed', 20: 'continued', 30: 'continued' }
    const goalDecisions = { 3: { decision: 'achieved' }, 4: { decision: 'newGoal' } }
    const result = summarizeTransition(students, goals, participation, goalDecisions)
    expect(result.goalContinueCount).toBe(0) // τα 2 goals του 10 αγνοούνται, όχι μετρημένα ως continue
    expect(result.goalAchievedCount).toBe(1)
    expect(result.goalNewCount).toBe(1)
  })

  it('goal χωρίς ρητή απόφαση μετράει ως continue', () => {
    const participation = { 10: 'continued', 20: 'continued', 30: 'continued' }
    const result = summarizeTransition(students, goals, participation, {})
    expect(result.goalContinueCount).toBe(4)
    expect(result.goalAchievedCount).toBe(0)
    expect(result.goalNewCount).toBe(0)
  })

  it('συμφωνεί ΑΚΡΙΒΩΣ με το μήκος του buildGoalDecisions αποτελέσματος (ίδιο φιλτράρισμα)', () => {
    const participation = { 10: 'departed', 20: 'continued', 30: 'continued' }
    const goalDecisions = {}
    const built = buildGoalDecisions(goals, goalDecisions, participation, '2026-09-01')
    const summary = summarizeTransition(students, goals, participation, goalDecisions)
    expect(built).toHaveLength(summary.goalContinueCount + summary.goalAchievedCount + summary.goalNewCount)
  })
})
