import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Copy, Download, Eye, FileText, Pencil, Star } from 'lucide-react'
import { db } from '../db.js'
import { generateReportText } from '../utils/reportText.js'
import { exportReportToDocx } from '../utils/reportDocx.js'
import { todayLocalISO, formatDateEl } from '../utils/date.js'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import FormField from './ui/FormField.jsx'
import Input from './ui/Input.jsx'
import Textarea from './ui/Textarea.jsx'
import Button from './ui/Button.jsx'
import ReportPreview from './ReportPreview.jsx'
import './ReportTab.css'

function monthsAgo(n) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const AUTOSAVE_DELAY_MS = 500

// Νέο workflow με επίμονο (persisted) προσχέδιο: επιλογή περιόδου → δημιουργία draft → επεξεργασία
// (auto-save στο ίδιο Report row, όχι μόνο local state) → preview → export/final. Η ΙΔΙΑ ΑΜΕΤΑΒΛΗΤΗ
// business logic παραγωγής κειμένου (generateReportText/exportReportToDocx) με πριν — το νέο
// επίπεδο είναι μόνο αποθήκευση/παρουσίαση γύρω τους.
export default function ReportTab({ student, studentId }) {
  const [dateFrom, setDateFrom] = useState(monthsAgo(3))
  const [dateTo, setDateTo] = useState(todayLocalISO)
  const [activeReportId, setActiveReportId] = useState(null)
  const [activeStatus, setActiveStatus] = useState('draft')
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  const saveTimeoutRef = useRef(null)
  useEffect(() => () => clearTimeout(saveTimeoutRef.current), [])

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
  const pastReports = useLiveQuery(
    () => db.reports.where('studentId').equals(studentId).reverse().sortBy('generatedAt'),
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

  async function handleGenerate() {
    const text = generateReportText({ student, dateFrom, dateTo, goals, sessions, measurements, observations })
    const now = new Date().toISOString()
    if (activeReportId) {
      await db.reports.update(activeReportId, { editedText: text, dateFrom, dateTo, generatedAt: now })
    } else {
      const id = await db.reports.add({
        studentId,
        type: 'progress',
        dateFrom,
        dateTo,
        generatedAt: now,
        editedText: text,
        status: 'draft',
        exportedAt: null
      })
      setActiveReportId(id)
      setActiveStatus('draft')
    }
    setDraft(text)
    setCopied(false)
    setPreviewMode(false)
  }

  function handleNewDraft() {
    setActiveReportId(null)
    setActiveStatus('draft')
    setDraft('')
    setPreviewMode(false)
  }

  function handleOpenReport(report) {
    setActiveReportId(report.id)
    setActiveStatus(report.status)
    setDateFrom(report.dateFrom)
    setDateTo(report.dateTo)
    setDraft(report.editedText)
    setPreviewMode(false)
  }

  function handleDraftChange(value) {
    setDraft(value)
    if (!activeReportId) return
    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      db.reports.update(activeReportId, { editedText: value })
    }, AUTOSAVE_DELAY_MS)
  }

  function flushPendingSave() {
    clearTimeout(saveTimeoutRef.current)
    if (activeReportId) db.reports.update(activeReportId, { editedText: draft })
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDownloadDocx() {
    const filename = `Έκθεση-${student.code}-${dateFrom}-${dateTo}.docx`.replace(/[\s/\\:*?"<>|]+/g, '_')
    exportReportToDocx(draft, filename)
    if (activeReportId) await db.reports.update(activeReportId, { exportedAt: new Date().toISOString() })
  }

  async function handleToggleFinal() {
    if (!activeReportId) return
    const nextStatus = activeStatus === 'final' ? 'draft' : 'final'
    await db.reports.update(activeReportId, { status: nextStatus })
    setActiveStatus(nextStatus)
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
        <div className="report-tab__generate-row">
          <Button variant="primary" icon={FileText} onClick={handleGenerate} disabled={dateRangeInvalid}>
            {draft ? 'Ανανέωση προσχεδίου' : 'Δημιουργία προσχεδίου'}
          </Button>
          {activeReportId && (
            <Button variant="ghost" onClick={handleNewDraft}>Νέα έκθεση</Button>
          )}
        </div>
        {draft && <p className="report-tab__hint">Η ανανέωση αντικαθιστά το κείμενο παρακάτω — τυχόν επεξεργασίες σου θα χαθούν.</p>}
      </Card>

      {pastReports && pastReports.length > 0 && (
        <details className="report-tab__history">
          <summary>Παλαιότερες εκθέσεις ({pastReports.length})</summary>
          <div className="report-tab__history-list">
            {pastReports.map((r) => (
              <button key={r.id} type="button" className="report-tab__history-item" onClick={() => handleOpenReport(r)}>
                <span>{formatDateEl(r.dateFrom)} – {formatDateEl(r.dateTo)}</span>
                <Badge variant={r.status === 'final' ? 'success' : 'neutral'}>
                  {r.status === 'final' ? 'Τελική' : 'Πρόχειρη'}
                </Badge>
              </button>
            ))}
          </div>
        </details>
      )}

      {draft && (
        <Card className="report-tab__draft">
          <div className="report-tab__draft-header">
            <h3 className="report-tab__draft-title">
              Επεξεργάσιμο κείμενο
              {activeStatus === 'final' && <Badge variant="success">Τελική έκδοση</Badge>}
            </h3>
            <Button
              variant="secondary"
              icon={previewMode ? Pencil : Eye}
              onClick={() => { if (!previewMode) flushPendingSave(); setPreviewMode((v) => !v) }}
            >
              {previewMode ? 'Επεξεργασία' : 'Προεπισκόπηση'}
            </Button>
          </div>

          {previewMode ? (
            <ReportPreview text={draft} />
          ) : (
            <Textarea className="report-tab__textarea" value={draft} onChange={(e) => handleDraftChange(e.target.value)} onBlur={flushPendingSave} />
          )}

          <div className="report-tab__actions">
            <Button variant="secondary" icon={Download} onClick={handleDownloadDocx}>Λήψη .docx</Button>
            <Button variant="secondary" icon={copied ? Check : Copy} onClick={handleCopy}>
              {copied ? 'Αντιγράφηκε!' : 'Αντιγραφή'}
            </Button>
            <Button variant={activeStatus === 'final' ? 'ghost' : 'secondary'} icon={Star} onClick={handleToggleFinal} disabled={!activeReportId}>
              {activeStatus === 'final' ? 'Επαναφορά σε πρόχειρη' : 'Οριστικοποίηση'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
