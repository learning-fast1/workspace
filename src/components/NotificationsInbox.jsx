import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Clock, Filter, RotateCcw, Sparkles, SearchX, X } from 'lucide-react'
import { todayLocalISO, addDays, formatDateEl } from '../utils/date.js'
import { resolveNotificationRoute } from '../utils/notificationEngine.js'
import { dismissNotification, snoozeNotification, unsnoozeNotification } from '../db.js'
import { useNotifications } from './shell/NotificationsProvider.jsx'
import AppShell from './shell/AppShell.jsx'
import PageHeader from './ui/PageHeader.jsx'
import Button from './ui/Button.jsx'
import Select from './ui/Select.jsx'
import FormField from './ui/FormField.jsx'
import EmptyState from './ui/EmptyState.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import './NotificationsInbox.css'

const SNOOZE_PRESETS = [
  { label: 'Αύριο', days: 1 },
  { label: 'Σε 3 ημέρες', days: 3 },
  { label: 'Την επόμενη εβδομάδα', days: 7 }
]

// Χρειάζονται προσοχή = warning (review χρήστη, σημείο 3 — ΟΧΙ «Επείγουσες»).
const SEVERITY_FILTERS = [
  { value: 'all', label: 'Όλες' },
  { value: 'warning', label: 'Χρειάζονται προσοχή' },
  { value: 'info', label: 'Ενημερωτικές' },
  { value: 'positive', label: 'Θετικές' }
]

const TYPE_LABELS = {
  goalStale: 'Στόχος χωρίς πρόοδο',
  goalPausedTooLong: 'Στόχος σε παύση',
  goalNearCriterion: 'Κοντά στο κριτήριο',
  goalCompletionCandidate: 'Υποψήφιος για ολοκλήρωση',
  draftReport: 'Πρόχειρη αναφορά',
  unresolvedSession: 'Εκκρεμής συνεδρία'
}

function notificationMeta(n) {
  return { type: n.type, entityType: n.entityType, entityId: n.entityId, studentId: n.studentId }
}

function studentLabelFor(n) {
  return n.student ? `${n.student.code}${n.student.nickname ? ` — ${n.student.nickname}` : ''}` : '—'
}

// Notifications Inbox (review χρήστη) — ΞΕΧΩΡΙΣΤΗ σελίδα, ΚΟΙΝΟΣ engine/schema/provider με το
// HomeAttentionWidget/Header (βλ. shell/NotificationsProvider.jsx) — καμία δεύτερη υπολογιστική
// λογική εδώ, μόνο rendering + φίλτρα + per-row ενέργειες. Χωρίς bulk actions, χωρίς pagination/
// virtualization, χωρίς ιστορικό dismissed (ρητές αποφάσεις review) — visible + snoozed μόνο.
export default function NotificationsInbox() {
  const navigate = useNavigate()
  const result = useNotifications()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [severityFilter, setSeverityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [studentFilter, setStudentFilter] = useState('all')

  const visible = result.status === 'ok' ? result.visible : []
  const snoozed = result.status === 'ok' ? result.snoozed : []

  // Student filter = ΕΝΩΣΗ visible+snoozed (review χρήστη, σημείο 4) — ένας μαθητής με ΜΟΝΟ
  // snoozed ειδοποίηση πρέπει επίσης να εμφανίζεται ως επιλογή.
  const studentOptions = useMemo(() => {
    const map = new Map()
    for (const n of [...visible, ...snoozed]) {
      if (n.student) map.set(n.studentId, n.student.code)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [visible, snoozed])

  function matchesFilters(n) {
    if (severityFilter !== 'all' && n.severity !== severityFilter) return false
    if (typeFilter !== 'all' && n.type !== typeFilter) return false
    if (studentFilter !== 'all' && String(n.studentId) !== studentFilter) return false
    return true
  }

  const filteredVisible = visible.filter(matchesFilters)
  const filteredSnoozed = snoozed.filter(matchesFilters)
  const hasAnyFilterActive = severityFilter !== 'all' || typeFilter !== 'all' || studentFilter !== 'all'
  const totalCount = visible.length + snoozed.length

  function clearFilters() {
    setSeverityFilter('all')
    setTypeFilter('all')
    setStudentFilter('all')
  }

  function goToNotification(n) {
    const route = resolveNotificationRoute(n.primaryAction)
    if (route) navigate(route.path, route.state ? { state: route.state } : undefined)
  }

  async function handleDismiss(n) {
    await dismissNotification(n.id, notificationMeta(n))
  }

  async function handleSnooze(n, days) {
    await snoozeNotification(n.id, addDays(todayLocalISO(), days), notificationMeta(n))
  }

  async function handleUnsnooze(n) {
    await unsnoozeNotification(n.id)
  }

  if (result.status === 'loading') {
    return (
      <AppShell>
        <PageHeader title="Ειδοποιήσεις" />
        <p aria-busy="true">Φόρτωση…</p>
      </AppShell>
    )
  }

  if (result.status === 'error') {
    return (
      <AppShell>
        <PageHeader title="Ειδοποιήσεις" />
        <p role="alert" className="notifications-inbox__error">
          <AlertTriangle size={16} aria-hidden="true" /> Δεν ήταν δυνατή η φόρτωση των ειδοποιήσεων.
        </p>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <PageHeader
        title="Ειδοποιήσεις"
        subtitle="Ό,τι χρειάζεται την προσοχή σου σε ολόκληρο το caseload, σε ένα σημείο."
      />

      {totalCount === 0 ? (
        <EmptyState icon={Sparkles} title="Όλα ενημερωμένα!" description="Καμία ειδοποίηση αυτή τη στιγμή." />
      ) : (
        <>
          <div className="notifications-inbox__filter-toggle">
            <Button
              variant={filtersOpen || hasAnyFilterActive ? 'primary' : 'secondary'}
              icon={Filter}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              Φίλτρα
            </Button>
          </div>

          {filtersOpen && (
            <div className="notifications-inbox__filters">
              <div className="notifications-inbox__severity-group" role="group" aria-label="Φίλτρο σοβαρότητας">
                {SEVERITY_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className="notifications-inbox__severity-chip"
                    aria-pressed={severityFilter === f.value}
                    onClick={() => setSeverityFilter(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <FormField htmlFor="notificationsTypeFilter" label="Τύπος">
                <Select id="notificationsTypeFilter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">Όλοι οι τύποι</option>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </FormField>

              <FormField htmlFor="notificationsStudentFilter" label="Μαθητής">
                <Select id="notificationsStudentFilter" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
                  <option value="all">Όλοι οι μαθητές</option>
                  {studentOptions.map(([id, code]) => (
                    <option key={id} value={String(id)}>{code}</option>
                  ))}
                </Select>
              </FormField>

              {hasAnyFilterActive && (
                <Button variant="ghost" onClick={clearFilters}>Καθαρισμός φίλτρων</Button>
              )}
            </div>
          )}

          <section aria-labelledby="notificationsInboxActiveHeading" className="notifications-inbox__section">
            <h2 id="notificationsInboxActiveHeading" className="notifications-inbox__section-title">
              Ενεργές{filteredVisible.length > 0 ? ` (${filteredVisible.length})` : ''}
            </h2>
            {filteredVisible.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="Καμία ειδοποίηση με αυτά τα φίλτρα"
                actionLabel={hasAnyFilterActive ? 'Καθαρισμός φίλτρων' : undefined}
                onAction={hasAnyFilterActive ? clearFilters : undefined}
              />
            ) : (
              <ul className="notifications-inbox__list">
                {filteredVisible.map((n) => {
                  const Icon = n.icon
                  const studentLabel = studentLabelFor(n)
                  const menuItems = [
                    ...SNOOZE_PRESETS.map((preset) => ({
                      label: `Αναβολή: ${preset.label}`,
                      icon: Clock,
                      onClick: () => handleSnooze(n, preset.days)
                    })),
                    { label: 'Απόρριψη', icon: X, onClick: () => handleDismiss(n), variant: 'danger' }
                  ]
                  return (
                    <li key={n.id} className={`notifications-inbox__row notifications-inbox__row--${n.severity}`}>
                      <button
                        type="button"
                        className="notifications-inbox__open"
                        onClick={() => goToNotification(n)}
                        aria-label={`${studentLabel} — ${n.label}`}
                      >
                        {Icon && <Icon size={14} aria-hidden="true" className="notifications-inbox__icon" />}
                        <span className="notifications-inbox__student">{studentLabel}</span>
                        <span className="notifications-inbox__label">{n.label}</span>
                      </button>
                      <OverflowMenu ariaLabel={`Ενέργειες για ειδοποίηση: ${studentLabel} — ${n.label}`} items={menuItems} />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {snoozed.length > 0 && (
            <section aria-labelledby="notificationsInboxSnoozedHeading" className="notifications-inbox__section">
              <h2 id="notificationsInboxSnoozedHeading" className="notifications-inbox__section-title">
                Σε αναβολή{filteredSnoozed.length > 0 ? ` (${filteredSnoozed.length})` : ''}
              </h2>
              {filteredSnoozed.length === 0 ? (
                <p className="notifications-inbox__empty-hint">Καμία σε αναβολή με αυτά τα φίλτρα.</p>
              ) : (
                <ul className="notifications-inbox__list">
                  {filteredSnoozed.map((n) => {
                    const Icon = n.icon
                    const studentLabel = studentLabelFor(n)
                    const menuItems = [
                      { label: 'Άρση αναβολής', icon: RotateCcw, onClick: () => handleUnsnooze(n) }
                    ]
                    return (
                      <li key={n.id} className={`notifications-inbox__row notifications-inbox__row--${n.severity}`}>
                        <button
                          type="button"
                          className="notifications-inbox__open"
                          onClick={() => goToNotification(n)}
                          aria-label={`${studentLabel} — ${n.label} — σε αναβολή έως ${formatDateEl(n.snoozedUntil)}`}
                        >
                          {Icon && <Icon size={14} aria-hidden="true" className="notifications-inbox__icon" />}
                          <span className="notifications-inbox__student">{studentLabel}</span>
                          <span className="notifications-inbox__label">{n.label}</span>
                          <span className="notifications-inbox__snoozed-until">έως {formatDateEl(n.snoozedUntil)}</span>
                        </button>
                        <OverflowMenu ariaLabel={`Ενέργειες για ειδοποίηση: ${studentLabel} — ${n.label}`} items={menuItems} />
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </AppShell>
  )
}
