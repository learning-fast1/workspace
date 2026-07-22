// Sprint 5A Phase 2 — δεδομένα (ΟΧΙ λογική) περιγράφοντας ποια πεδία κάθε πίνακα είναι foreign
// keys και προς ποιον πίνακα δείχνουν, ώστε το (μελλοντικό, Commit 2) migration να ξέρει ΠΟΙΟΝ
// deterministicId() να ξαναϋπολογίσει για κάθε αναφορά. Καμία ξεχωριστή αντιστοίχιση αποθηκεύεται
// — η ίδια η deterministicId() συνάρτηση είναι η πηγή αλήθειας, αυτός ο χάρτης λέει μόνο "ποιο
// target table" να χρησιμοποιηθεί ως δεύτερο όρισμα.
//
// Σχήμα ανά πεδίο:
//   'targetTable'                          — απλό, single-value foreign key
//   { table: 'targetTable', array: true }  — πεδίο-array, κάθε στοιχείο ξεχωριστό foreign key
// Πίνακες χωρίς κανένα foreign key (students, goalTemplates, calendarEvents, domainTemplates) δεν
// χρειάζονται εγγραφή εδώ — η απουσία τους είναι ισοδύναμη με {}.
export const FOREIGN_KEY_MAP = {
  goals: {
    studentId: 'students'
  },
  sessions: {
    studentIds: { table: 'students', array: true }
  },
  measurements: {
    sessionId: 'sessions',
    studentId: 'students',
    goalId: 'goals'
  },
  observations: {
    // sessionId: nullable στο πραγματικό schema (μια παρατήρηση μπορεί να αποσυνδεθεί από τη
    // συνεδρία της αν η συνεδρία διαγραφεί — βλ. deleteSession στο db.js). Το migration πρέπει να
    // αφήνει null/undefined τιμές ανέγγιχτες, να μετασχηματίζει μόνο πραγματικές τιμές.
    studentId: 'students',
    sessionId: 'sessions'
  },
  reports: {
    studentId: 'students'
  },
  dailyQueue: {
    studentIds: { table: 'students', array: true },
    // scheduleSeriesId: nullable (null = χειροκίνητη προσθήκη, όχι από πρόγραμμα — βλ. db.js).
    scheduleSeriesId: 'scheduleSlots'
  },
  scheduleSlots: {
    // Αυτο-αναφορικό: το seriesId ισούται με το id της ΠΡΩΤΗΣ έκδοσης της ίδιας σειράς
    // (createScheduleSlot στο db.js) — ΟΧΙ ξεχωριστός πίνακας, το ΙΔΙΟ scheduleSlots.
    seriesId: 'scheduleSlots'
  },
  scheduleExceptions: {
    seriesId: 'scheduleSlots'
  },
  schoolYearParticipation: {
    studentId: 'students',
    schoolYearId: 'schoolYears'
  },
  goalEvents: {
    goalId: 'goals'
  },
  sessionGoalAssessments: {
    sessionId: 'sessions',
    studentId: 'students',
    goalId: 'goals'
  }
}
