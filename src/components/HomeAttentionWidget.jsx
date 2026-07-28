import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Clock, X } from 'lucide-react'
import { todayLocalISO, addDays } from '../utils/date.js'
import { loadNotifications } from '../utils/notificationData.js'
import { dismissNotification, snoozeNotification, cleanupOrphanedNotificationState } from '../db.js'
import Button from './ui/Button.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import './HomeAttentionWidget.css'

const VISIBLE_LIMIT = 5

const SNOOZE_PRESETS = [
  { label: 'Αύριο', days: 1 },
  { label: 'Σε 3 ημέρες', days: 3 },
  { label: 'Την επόμενη εβδομάδα', days: 7 }
]

// Smart Notifications (review χρήστη) — ΤΟ ΙΔΙΟ widget εξελίσσεται, ΔΕΝ δημιουργείται δεύτερο
// παράλληλο «χρειάζονται προσοχή». Τροφοδοτείται πλέον από utils/notificationData.js (η
// goal-level έξοδος του πρώην utils/homeAttentionData.js είναι γνήσιο υποσύνολο αυτής) — draft
// reports/unresolved sessions/completion candidates εμφανίζονται πλέον ΕΔΩ, ίδια λίστα, καμία
// δεύτερη. severity/label/icon/primaryAction είναι ΠΑΝΤΑ computed από το notificationEngine.js
// (βλ. εκεί) — αυτό το component ΔΕΝ αποφασίζει τίποτα, μόνο rendering + dismiss/snooze ενέργειες.
export default function HomeAttentionWidget() {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)

  const result = useLiveQuery(async () => {
    try {
      const { items, candidateIds } = await loadNotifications(todayLocalISO())
      return { status: 'ok', items, candidateIds }
    } catch (err) {
      return { status: 'error', message: err?.message || 'Δεν ήταν δυνατή η φόρτωση.' }
    }
  }, [])

  // Cleanup ΕΚΤΟΣ του read-only useLiveQuery querier (Dexie πετάει ReadOnlyError αλλιώς, ίδιο
  // idiom με ensureDayGenerated στο TodayQueue.jsx) — καθαρίζει ΜΟΝΟ resolved/orphan state
  // (goal διαγράφηκε, μέτρηση καταγράφηκε, report έγινε final), ΠΟΤΕ ληγμένα snoozes (review
  // χρήστη). Ασφαλές να ξανατρέξει σε κάθε ζωντανή ανανέωση — idempotent, μηδενικό-cost όταν δεν
  // υπάρχει τίποτα ορφανό.
  useEffect(() => {
    if (result?.status !== 'ok') return
    cleanupOrphanedNotificationState(result.candidateIds).catch(() => {})
  }, [result])

  // Loading — ήρεμο, σταθερού ύψους skeleton (καμία μετατόπιση διάταξης).
  if (result === undefined) {
    return (
      <div className="home-attention-widget home-attention-widget--loading" aria-busy="true" aria-label="Φόρτωση: Χρειάζονται προσοχή">
        <div className="home-attention-widget__skeleton-line" />
        <div className="home-attention-widget__skeleton-line" />
      </div>
    )
  }

  if (result.status === 'error') {
    return (
      <div className="home-attention-widget home-attention-widget--error">
        <p role="alert" className="home-attention-widget__error-text">
          <AlertTriangle size={14} aria-hidden="true" /> Δεν ήταν δυνατή η φόρτωση των στοιχείων προσοχής.
        </p>
      </div>
    )
  }

  const { items } = result
  // Μηδέν items → ΚΑΜΙΑ κάρτα καθόλου — όχι «Όλα καλά», περιττό οπτικό βάρος.
  if (items.length === 0) return null

  const visible = expanded ? items : items.slice(0, VISIBLE_LIMIT)
  const hasMore = items.length > VISIBLE_LIMIT

  function goToNotification(n) {
    if (n.primaryAction.type === 'openGoal') {
      navigate(`/students/${n.primaryAction.studentId}/goals/${n.primaryAction.goalId}`)
    } else if (n.primaryAction.type === 'openStudent') {
      navigate(`/students/${n.primaryAction.studentId}`, n.primaryAction.activeTab ? { state: { activeTab: n.primaryAction.activeTab } } : undefined)
    }
  }

  function notificationMeta(n) {
    return { type: n.type, entityType: n.entityType, entityId: n.entityId, studentId: n.studentId }
  }

  async function handleDismiss(n) {
    await dismissNotification(n.id, notificationMeta(n))
  }

  async function handleSnooze(n, days) {
    await snoozeNotification(n.id, addDays(todayLocalISO(), days), notificationMeta(n))
  }

  return (
    <section className="home-attention-widget" aria-labelledby="homeAttentionHeading">
      <h2 id="homeAttentionHeading" className="home-attention-widget__heading">
        Χρειάζονται προσοχή{items.length > VISIBLE_LIMIT ? ` (${items.length})` : ''}
      </h2>
      <ul className="home-attention-widget__list">
        {visible.map((n) => {
          const Icon = n.icon
          const studentLabel = n.student ? `${n.student.code}${n.student.nickname ? ` — ${n.student.nickname}` : ''}` : '—'
          const menuItems = [
            ...SNOOZE_PRESETS.map((preset) => ({
              label: `Αναβολή: ${preset.label}`,
              icon: Clock,
              onClick: () => handleSnooze(n, preset.days)
            })),
            { label: 'Απόρριψη', icon: X, onClick: () => handleDismiss(n), variant: 'danger' }
          ]
          return (
            <li key={n.id} className={`home-attention-widget__row home-attention-widget__row--${n.severity}`}>
              <button
                type="button"
                className="home-attention-widget__open"
                onClick={() => goToNotification(n)}
                aria-label={`${studentLabel} — ${n.label}`}
              >
                {Icon && <Icon size={14} aria-hidden="true" className="home-attention-widget__icon" />}
                <span className="home-attention-widget__student">{studentLabel}</span>
                <span className="home-attention-widget__label">{n.label}</span>
              </button>
              <OverflowMenu ariaLabel={`Ενέργειες για ειδοποίηση: ${studentLabel} — ${n.label}`} items={menuItems} />
            </li>
          )
        })}
      </ul>
      {hasMore && !expanded && (
        <Button variant="ghost" onClick={() => setExpanded(true)}>Δες όλα ({items.length})</Button>
      )}
    </section>
  )
}
