// Pure βοηθητικές για το YearTransitionWizard (Technical Plan Στάδιο 10) — μετατρέπουν το τοπικό
// state του wizard (participation/goalDecisions maps) στο ακριβές payload που περιμένει το
// applySchoolYearTransition (db.js), ΚΑΙ στα σύνολα του review step. Ξεχωρισμένα από το ίδιο το
// React component ώστε να είναι μονάδο-δοκιμάσιμα χωρίς DOM/React, και ώστε το review step να
// υπολογίζει τα σύνολα ΑΠΟ ΤΑ ΙΔΙΑ δεδομένα που στέλνονται στο submit — καμία ξεχωριστή, δυνητικά
// ασύμφωνη μέτρηση.

// participation: { [studentId]: 'continued' | 'departed' }
export function buildParticipationDecisions(participation) {
  return Object.entries(participation).map(([studentId, status]) => ({
    studentId: Number(studentId), status, reason: ''
  }))
}

// goalDecisions: { [goalId]: { decision: 'continue' | 'achieved' | 'newGoal', newGoalTitle? } }
// Στόχοι μαθητών που αποχωρούν (participation[studentId] === 'departed') ΑΠΟΚΛΕΙΟΝΤΑΙ εντελώς —
// σημείο 6: «δεν χρειάζεται να εμφανίζονται αποφάσεις στόχων που δεν θα εφαρμοστούν». Στόχοι χωρίς
// ρητή απόφαση στο goalDecisions θεωρούνται 'continue' (ασφαλής προεπιλογή, σημείο 5).
export function buildGoalDecisions(goals, goalDecisions, participation, newYearStartDate) {
  return goals
    .filter((g) => participation[g.studentId] !== 'departed')
    .map((g) => {
      const entry = goalDecisions[g.id] || { decision: 'continue' }
      if (entry.decision === 'newGoal') {
        return {
          goalId: g.id,
          studentId: g.studentId,
          decision: 'newGoal',
          newGoalFields: {
            domain: g.domain,
            title: (entry.newGoalTitle || g.title || '').trim(),
            description: g.description || '',
            criterion: g.criterion || '',
            measurementType: g.measurementType || '',
            supportLevel: g.supportLevel || '',
            priority: g.priority || 'medium',
            startDate: newYearStartDate
          }
        }
      }
      return { goalId: g.id, studentId: g.studentId, decision: entry.decision }
    })
}

// Σύνολα για το review step (σημείο 3) — υπολογισμένα με την ΙΔΙΑ λογική φιλτραρίσματος
// (αποχωρούντες μαθητές αποκλείονται από τα goal counts) όπως το buildGoalDecisions παραπάνω, ώστε
// το review να ΣΥΜΦΩΝΕΙ πάντα με τις πραγματικές αποφάσεις που θα σταλούν.
export function summarizeTransition(students, goals, participation, goalDecisions) {
  let continuedCount = 0
  let departedCount = 0
  for (const s of students) {
    if (participation[s.id] === 'departed') departedCount++
    else continuedCount++
  }

  const counts = { continue: 0, achieved: 0, newGoal: 0 }
  for (const g of goals) {
    if (participation[g.studentId] === 'departed') continue
    const decision = (goalDecisions[g.id] || {}).decision || 'continue'
    counts[decision] = (counts[decision] || 0) + 1
  }

  return {
    continuedCount,
    departedCount,
    goalContinueCount: counts.continue,
    goalAchievedCount: counts.achieved,
    goalNewCount: counts.newGoal
  }
}
