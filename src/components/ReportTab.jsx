import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Copy, Download, FileText } from 'lucide-react'
import { db } from '../db.js'
import { generateReportText } from '../utils/reportText.js'
import { exportReportToDocx } from '../utils/reportDocx.js'
import { todayLocalISO } from '../utils/date.js'
import Card from './ui/Card.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import Textarea from './ui/Textarea.jsx'
import Button from './ui/Button.jsx'
import './ReportTab.css'

function monthsAgo(n) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Νέο tab με ΑΜΕΤΑΒΛΗΤΗ business logic — ίδιες συναρτήσεις (generateReportText/exportReportToDocx)
// με το ξεχωριστό ReportBuilder.jsx (route /students/:id/report, παραμένει άθικτο), απλά νέα
// παρουσίαση εντός του tab «Έκθεση» της καρτέλας μαθητή. Το `student` έρχεται έτοιμο από το
// StudentProfile (ήδη φορτωμένο για το Hero) — μόνο τα υπόλοιπα (goals/sessions/measurements/
// observations) γίνονται δικό του query, ίδιο μοτίβο με τα άλλα tabs.
export default function ReportTab({ student, studentId }) {
  const [dateFrom, setDateFrom] = useState(monthsAgo(3))
  const [dateTo, setDateTo] = useState(todayLocalISO)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  const dateRangeInvalid = dateFrom > dateTo

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

  if (!goals || !allSessions || !allMeasurements || !observations) {
    return <p>Φόρτωση…</p>
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
    const filename = `Έκθεση-${student.code}-${dateFrom}-${dateTo}.docx`.replace(/[\s/\\:*?"<>|]+/g, '_')
    exportReportToDocx(draft, filename)
  }

  return (
    <div className="report-tab">
      <Card className="report-tab__controls">
        <div className="report-tab__row">
          <FormField htmlFor="reportDateFrom" label="Από">
            <Input id="reportDateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </FormField>
          <FormField htmlFor="reportDateTo" label="Έως">
            <Input id="reportDateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </FormField>
        </div>
        {dateRangeInvalid && (
          <p className="report-tab__error">Η ημερομηνία «Έως» είναι πριν το «Από» — διόρθωσε το εύρος για να δημιουργηθεί σωστό προσχέδιο.</p>
        )}
        <Button variant="primary" icon={FileText} onClick={handleGenerate} disabled={dateRangeInvalid}>
          {draft ? 'Ανανέωση προσχεδίου' : 'Δημιουργία προσχεδίου'}
        </Button>
        {draft && <p className="report-tab__hint">Η ανανέωση αντικαθιστά το κείμενο παρακάτω — τυχόν επεξεργασίες σου θα χαθούν.</p>}
      </Card>

      {draft && (
        <Card className="report-tab__draft">
          <h3 className="report-tab__draft-title">Επεξεργάσιμο κείμενο</h3>
          <Textarea className="report-tab__textarea" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="report-tab__actions">
            <Button variant="secondary" icon={Download} onClick={handleDownloadDocx}>Λήψη .docx</Button>
            <Button variant="secondary" icon={copied ? Check : Copy} onClick={handleCopy}>
              {copied ? 'Αντιγράφηκε!' : 'Αντιγραφή'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
