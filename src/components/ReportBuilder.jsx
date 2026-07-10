import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.js'
import { generateReportText } from '../utils/reportText.js'
import { exportReportToDocx } from '../utils/reportDocx.js'
import { todayLocalISO } from '../utils/date.js'

function monthsAgo(n) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Wrapper: React Router δεν κάνει remount το ReportBuilder όταν αλλάζει μόνο η παράμετρος :id
// (ίδιο route, ίδιο component instance) — το key={id} εδώ αναγκάζει πλήρες remount του ReportBuilderInner
// ώστε το δικό του state (draft, ημερομηνίες) να μη «διαρρεύσει» από μαθητή σε μαθητή.
export default function ReportBuilder() {
  const { id } = useParams()
  return <ReportBuilderInner key={id} studentId={Number(id)} />
}

function ReportBuilderInner({ studentId }) {
  const [dateFrom, setDateFrom] = useState(monthsAgo(3))
  const [dateTo, setDateTo] = useState(todayLocalISO)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  const dateRangeInvalid = dateFrom > dateTo

  // null = «δεν έχει τρέξει ακόμα» (βλ. ίδιο σχόλιο στο StudentProfile.jsx) — χωρίς αυτό, ένας
  // μαθητής που διαγράφηκε (π.χ. από άλλη καρτέλα) θα άφηνε την οθόνη κολλημένη σε «Φόρτωση…» για πάντα.
  const student = useLiveQuery(() => db.students.get(studentId), [studentId], null)
  const goals = useLiveQuery(() => db.goals.where('studentId').equals(studentId).toArray(), [studentId])
  const allSessions = useLiveQuery(() => db.sessions.toArray(), [])
  const allMeasurements = useLiveQuery(
    () => db.measurements.where('studentId').equals(studentId).toArray(),
    [studentId]
  )
  const observations = useLiveQuery(
    () => db.observations.where('studentId').equals(studentId).toArray(),
    [studentId]
  )

  if (student === null || !goals || !allSessions || !allMeasurements || !observations) {
    return <div className="page">Φόρτωση…</div>
  }

  if (!student) {
    return (
      <div className="page">
        <p className="empty-state">Ο μαθητής δεν βρέθηκε.</p>
        <Link to="/students" className="btn btn-secondary">Πίσω στη λίστα</Link>
      </div>
    )
  }

  const sessions = allSessions.filter(
    (s) => s.studentIds?.includes(studentId) && s.date >= dateFrom && s.date <= dateTo
  )
  const sessionIdsInPeriod = new Set(sessions.map((s) => s.id))
  const measurements = allMeasurements.filter((m) => sessionIdsInPeriod.has(m.sessionId))

  function handleGenerate() {
    const text = generateReportText({ student, dateFrom, dateTo, goals, sessions, measurements, observations })
    setDraft(text)
    setCopied(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownloadDocx() {
    // Ο κωδικός μαθητή είναι ελεύθερο κείμενο — καθαρίζονται και χαρακτήρες μη έγκυροι σε
    // ονόματα αρχείων (π.χ. αν κάποιος γράψει κωδικό με «/»), όχι μόνο κενά.
    const filename = `Έκθεση-${student.code}-${dateFrom}-${dateTo}.docx`.replace(/[\s/\\:*?"<>|]+/g, '_')
    exportReportToDocx(draft, filename)
  }

  return (
    <div className="page">
      <div className="top-bar">
        <Link to={`/students/${studentId}`} className="btn btn-link">← Πίσω</Link>
      </div>

      <h1>Προσχέδιο έκθεσης — {student.code}{student.nickname ? ` — ${student.nickname}` : ''}</h1>

      <div className="section">
        <div className="field">
          <label htmlFor="dateFrom">Από</label>
          <input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="dateTo">Έως</label>
          <input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {dateRangeInvalid && <p className="hint">⚠️ Η ημερομηνία «Έως» είναι πριν το «Από» — διόρθωσε το εύρος για να δημιουργηθεί σωστό προσχέδιο.</p>}
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={dateRangeInvalid}>
          {draft ? '🔄 Ανανέωση προσχεδίου' : '📄 Δημιουργία προσχεδίου'}
        </button>
        {draft && <p className="hint">Η ανανέωση αντικαθιστά το κείμενο παρακάτω — τυχόν επεξεργασίες σου θα χαθούν.</p>}
      </div>

      {draft && (
        <div className="section">
          <h2>Επεξεργάσιμο κείμενο</h2>
          <div className="field">
            <textarea
              className="report-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <div className="actions-row">
            <button type="button" className="btn btn-primary" onClick={handleDownloadDocx}>⬇️ Λήψη .docx</button>
            <button type="button" className="btn btn-secondary" onClick={handleCopy}>
              {copied ? '✓ Αντιγράφηκε!' : '📋 Αντιγραφή'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
