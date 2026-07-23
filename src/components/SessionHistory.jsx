import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarX2, Filter, History, SearchX } from 'lucide-react'
import { deleteSession, getActiveSchoolYear } from '../db.js'
import { activeTable } from '../migration/activeGeneration.js'
import { schoolYearToDateRange } from '../utils/schoolYearFilter.js'
import { todayLocalISO, formatDateEl } from '../utils/date.js'
import { SESSION_STATUSES } from '../config/sessionOptions.js'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import SearchBar from './ui/SearchBar.jsx'
import Select from './ui/Select.jsx'
import Input from './ui/Input.jsx'
import Button from './ui/Button.jsx'
import EmptyState from './ui/EmptyState.jsx'
import Modal from './ui/Modal.jsx'
import SessionCard from './SessionCard.jsx'
import SessionModal from './SessionModal.jsx'
import './SessionHistory.css'

function formatMonth(monthStr) {
  return new Date(`${monthStr}-01`).toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })
}

// Συγκεντρωτικό query — ένα query ανά πίνακα (sessions/students), όχι ένα ανά κάρτα (ίδιο μοτίβο
// με StudentList/GoalsList). Ταξινομημένο ήδη πιο πρόσφατο πρώτο, ώστε οι σημερινές/πρόσφατες
// συνεδρίες να είναι πάντα στην κορυφή χωρίς έξτρα δουλειά.
async function loadSessions(studentId) {
  const [sessions, students] = await Promise.all([
    activeTable('sessions').orderBy('date').reverse().toArray(),
    activeTable('students').toArray()
  ])
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]))
  const scoped = studentId ? sessions.filter((s) => s.studentIds?.includes(studentId)) : sessions

  return scoped.map((s) => ({
    ...s,
    students: s.studentIds.map((id) => ({
      id,
      code: studentById[id]?.code || '?',
      nickname: studentById[id]?.nickname || '',
      absent: s.absentStudentIds?.includes(id)
    }))
  }))
}

function matchesSearch(session, query) {
  if (!query) return true
  if (session.students.some((s) => s.code.toLowerCase().includes(query) || s.nickname.toLowerCase().includes(query))) return true
  if (session.activity?.toLowerCase().includes(query)) return true
  if (session.note?.toLowerCase().includes(query)) return true
  return false
}

// studentId: όταν δίνεται, η λίστα είναι ήδη φιλτραρισμένη σε αυτόν τον μαθητή (StudentProfile tab
// «Συνεδρίες»). embedded: true όταν φιλοξενείται μέσα σε άλλη σελίδα (όχι δικό της AppShell/PageHeader).
export default function SessionHistory({ studentId, embedded = false }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  // Αρχικοποίηση από URL query params (Technical Plan Στάδιο 11, σημεία 1/5) — π.χ. από «Δες
  // συνεδρίες αυτού του έτους» στις Ρυθμίσεις. Το ίδιο το φιλτράρισμα γίνεται ΑΠΟΚΛΕΙΣΤΙΚΑ μέσω
  // dateFrom/dateTo (ήδη υπάρχον idiom παρακάτω) — καμία δεύτερη λογική. yearLabel υπάρχει ΜΟΝΟ
  // για την ορατή ένδειξη «Προβολή ιστορικού έτους» — δεν επηρεάζει το φιλτράρισμα.
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '')
  const [yearLabel, setYearLabel] = useState(searchParams.get('yearLabel') || '')

  const [activeSession, setActiveSession] = useState(null) // { id, mode: 'view'|'edit' } | null
  const [pendingDelete, setPendingDelete] = useState(null) // { id, dateLabel } | null

  const sessions = useLiveQuery(() => loadSessions(studentId), [studentId])
  const activeSchoolYear = useLiveQuery(() => getActiveSchoolYear(), [])

  // «Επιστροφή σε Όλα» (σημείο 5) — καθαρίζει ΚΑΙ το local state ΚΑΙ το URL, ώστε refresh/κοινή
  // χρήση του συνδέσμου να μη γυρίσει κατά λάθος στο ιστορικό φίλτρο.
  function clearHistoricalYearFilter() {
    setDateFrom('')
    setDateTo('')
    setYearLabel('')
    setSearchParams({}, { replace: true })
  }

  // «Επιστροφή στο τρέχον έτος» (σημείο 5, η δεύτερη επιτρεπτή διαδρομή) — ίδιο idiom μετατροπής
  // (schoolYearToDateRange) με τον σύνδεσμο των Ρυθμίσεων, όχι δεύτερος αλγόριθμος.
  function viewActiveSchoolYear() {
    if (!activeSchoolYear) return
    const { dateFrom: from, dateTo: to } = schoolYearToDateRange(activeSchoolYear)
    setDateFrom(from)
    setDateTo(to)
    setYearLabel(activeSchoolYear.label)
    setSearchParams({ dateFrom: from, dateTo: to, yearLabel: activeSchoolYear.label }, { replace: true })
  }

  const filtered = useMemo(() => {
    if (!sessions) return []
    const q = search.trim().toLowerCase()
    return sessions.filter((s) => {
      if (!matchesSearch(s, q)) return false
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (typeFilter === 'individual' && s.studentIds.length !== 1) return false
      if (typeFilter === 'group' && s.studentIds.length <= 1) return false
      if (dateFrom && s.date < dateFrom) return false
      if (dateTo && s.date > dateTo) return false
      return true
    })
  }, [sessions, search, statusFilter, typeFilter, dateFrom, dateTo])

  const today = todayLocalISO()
  const todaySessions = filtered.filter((s) => s.date === today)
  const olderSessions = filtered.filter((s) => s.date !== today)

  const groups = []
  let currentGroup = null
  for (const s of olderSessions) {
    const month = s.date.slice(0, 7)
    if (!currentGroup || currentGroup.month !== month) {
      currentGroup = { month, label: formatMonth(month), items: [] }
      groups.push(currentGroup)
    }
    currentGroup.items.push(s)
  }

  function handleDuplicate(session) {
    navigate(`/teaching/session/${session.studentIds.join(',')}`)
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    await deleteSession(pendingDelete.id)
    setPendingDelete(null)
  }

  function renderCard(s) {
    return (
      <SessionCard
        key={s.id}
        dateLabel={formatDateEl(s.date)}
        durationMinutes={s.durationMinutes}
        status={s.status}
        students={s.students}
        activity={s.activity}
        note={s.note}
        onOpen={() => setActiveSession({ id: s.id, mode: 'view' })}
        onEdit={() => setActiveSession({ id: s.id, mode: 'edit' })}
        onDelete={() => setPendingDelete({ id: s.id, dateLabel: formatDateEl(s.date) })}
        onDuplicate={() => handleDuplicate(s)}
      />
    )
  }

  const hasAnyFilterActive = statusFilter !== 'all' || typeFilter !== 'all' || dateFrom || dateTo

  const body = (
    <>
      {!embedded && (
        <PageHeader
          title="Συνεδρίες"
          subtitle={sessions ? `${sessions.length} ${sessions.length === 1 ? 'συνεδρία' : 'συνεδρίες'}` : undefined}
        />
      )}

      {yearLabel && (
        <div className="session-history__year-banner" role="status">
          <History size={16} aria-hidden="true" />
          <span className="session-history__year-banner-text">
            Προβολή ιστορικού σχολικού έτους: <strong>{yearLabel}</strong> ({formatDateEl(dateFrom)} – {formatDateEl(dateTo)})
          </span>
          <div className="session-history__year-banner-actions">
            <Button variant="ghost" onClick={clearHistoricalYearFilter}>Όλες οι συνεδρίες</Button>
            {activeSchoolYear && activeSchoolYear.label !== yearLabel && (
              <Button variant="ghost" onClick={viewActiveSchoolYear}>Τρέχον έτος ({activeSchoolYear.label})</Button>
            )}
          </div>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <div className="session-history__toolbar">
          <SearchBar
            value={search}
            onChange={setSearch}
            onClear={() => setSearch('')}
            placeholder="Αναζήτηση με μαθητή, δραστηριότητα ή σημείωση…"
          />
          <Button
            variant={filtersOpen || hasAnyFilterActive ? 'primary' : 'secondary'}
            icon={Filter}
            onClick={() => setFiltersOpen((v) => !v)}
            ariaLabel="Φίλτρα"
          >
            Φίλτρα
          </Button>
        </div>
      )}

      {filtersOpen && (
        <div className="session-history__filters">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Κατάσταση">
            <option value="all">Όλες οι καταστάσεις</option>
            {SESSION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Τύπος συνεδρίας">
            <option value="all">Ατομικό &amp; ομαδικό</option>
            <option value="individual">Μόνο ατομικό</option>
            <option value="group">Μόνο ομαδικό</option>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setYearLabel('') }}
            aria-label="Από ημερομηνία"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setYearLabel('') }}
            aria-label="Έως ημερομηνία"
          />
        </div>
      )}

      {!sessions && <p>Φόρτωση…</p>}

      {sessions && sessions.length === 0 && (
        <EmptyState
          icon={CalendarX2}
          title="Δεν υπάρχουν ακόμα συνεδρίες"
          description={studentId ? 'Ξεκίνα την πρώτη συνεδρία αυτού του μαθητή.' : 'Ξεκίνα μια συνεδρία για να εμφανιστεί εδώ.'}
          actionLabel="Νέα συνεδρία"
          actionTo="/teaching/individual"
        />
      )}

      {sessions && sessions.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={SearchX}
          title="Δεν βρέθηκαν συνεδρίες"
          description="Δοκίμασε διαφορετικό όρο αναζήτησης ή διαφορετικά φίλτρα."
          actionLabel="Καθαρισμός αναζήτησης"
          onAction={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); clearHistoricalYearFilter() }}
        />
      )}

      {todaySessions.length > 0 && (
        <div className="session-history__group">
          <h3 className="session-history__group-title">Σήμερα</h3>
          <div className="session-history__list">
            {todaySessions.map(renderCard)}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.month} className="session-history__group">
          <h3 className="session-history__group-title">{group.label}</h3>
          <div className="session-history__list">
            {group.items.map(renderCard)}
          </div>
        </div>
      ))}

      {activeSession && (
        <SessionModal
          sessionId={activeSession.id}
          initialMode={activeSession.mode}
          onClose={() => setActiveSession(null)}
        />
      )}

      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={`Διαγραφή συνεδρίας — ${pendingDelete?.dateLabel}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>Ακύρωση</Button>
            <Button variant="danger" onClick={handleConfirmDelete}>Διαγραφή οριστικά</Button>
          </>
        }
      >
        <p>Θα διαγραφούν επίσης όλες οι μετρήσεις αυτής της συνεδρίας. Δεν αναιρείται.</p>
      </Modal>
    </>
  )

  if (embedded) return <div className="session-history session-history--embedded">{body}</div>

  return (
    <AppShell>
      <div className="session-history">{body}</div>
    </AppShell>
  )
}
