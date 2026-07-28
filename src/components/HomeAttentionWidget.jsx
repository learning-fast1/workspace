import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CalendarClock, PauseCircle, TrendingUp } from 'lucide-react'
import { loadHomeAttentionItems } from '../utils/homeAttentionData.js'
import Button from './ui/Button.jsx'
import './HomeAttentionWidget.css'

const VISIBLE_LIMIT = 5

// Εικονίδιο ΚΑΙ χρώμα ανά τύπο λόγου (Sprint 7 feedback χρήστη, σημείο 2) — οπτική διαφοροποίηση
// ώστε να φαίνεται αμέσως ΓΙΑΤΙ ένας στόχος χρειάζεται προσοχή, χωρίς να ανοίξει κανείς τη γραμμή.
// Το ίδιο το κείμενο (r.label) έρχεται πλέον ΑΠΟΚΛΕΙΣΤΙΚΑ από το goalAttention.js/measurementTypes
// registry — καμία δεύτερη ερμηνεία/ετικέτα εδώ (μοναδική πηγή αλήθειας, βλ. σχόλιο εκεί).
const REASON_ICON = { stale: CalendarClock, nearCriterion: TrendingUp, pausedTooLong: PauseCircle }

function reasonsText(reasons) {
  return reasons.map((r) => r.label).join(', ')
}

// Δευτερεύον widget της Αρχικής (Technical Plan Στάδιο 13) — ΚΑΤΩ από το «Η μέρα μου», ήπιο, ΧΩΡΙΣ
// hero treatment/κόκκινο banner (σημείο 1). ΜΙΑ γραμμή ανά goal (όχι ανά reason, σημείο 2) —
// καταναλώνει αυτούσιο το ήδη deterministic-ταξινομημένο αποτέλεσμα του utils/homeAttentionData.js
// (το οποίο με τη σειρά του απλά καλεί το computeAttentionAcrossStudents, Στάδιο 8 — καμία δεύτερη
// ταξινόμηση εδώ, σημείο 3).
export default function HomeAttentionWidget() {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)

  const result = useLiveQuery(async () => {
    try {
      const items = await loadHomeAttentionItems(new Date())
      return { status: 'ok', items }
    } catch (err) {
      return { status: 'error', message: err?.message || 'Δεν ήταν δυνατή η φόρτωση.' }
    }
  }, [])

  // Loading — ήρεμο, σταθερού ύψους skeleton (σημείο 9, καμία μετατόπιση διάταξης).
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
  // Μηδέν items → ΚΑΜΙΑ κάρτα καθόλου (σημείο 9 — όχι «Όλα καλά», περιττό οπτικό βάρος).
  if (items.length === 0) return null

  const visible = expanded ? items : items.slice(0, VISIBLE_LIMIT)
  const hasMore = items.length > VISIBLE_LIMIT

  // Κλικ σε γραμμή (σημείο 5) — HashRouter idiom: το URL hash χρησιμοποιείται ήδη ΑΠΟΚΛΕΙΣΤΙΚΑ
  // από το routing, άρα δεν υπάρχει ελεύθερο native anchor-hash για scroll. Το ΑΣΦΑΛΕΣ fallback
  // είναι δομικό, όχι τεχνικό: το StudentDashboardPanel (Στάδιο 12) είναι ήδη η ΠΡΩΤΗ ενότητα μετά
  // το Hero στο StudentProfile — έτσι, ακόμα κι αν χαθεί το location.state (π.χ. refresh), ο
  // μαθητής βρίσκεται σωστά και το panel είναι ήδη ορατό χωρίς κύλιση. Το location.state.focusGoalId
  // είναι η ΕΝΙΣΧΥΣΗ πάνω σε αυτό το fallback — όταν επιβιώνει (κανονική in-app πλοήγηση), το
  // StudentDashboardPanel κάνει scroll/focus ΚΑΙ επισημαίνει προσωρινά τη συγκεκριμένη γραμμή.
  function goToStudent(item) {
    navigate(`/students/${item.studentId}`, { state: { focusGoalId: item.goalId } })
  }

  return (
    <section className="home-attention-widget" aria-labelledby="homeAttentionHeading">
      <h2 id="homeAttentionHeading" className="home-attention-widget__heading">
        Χρειάζονται προσοχή{items.length > VISIBLE_LIMIT ? ` (${items.length})` : ''}
      </h2>
      <ul className="home-attention-widget__list">
        {visible.map((item) => {
          const studentLabel = item.student ? `${item.student.code}${item.student.nickname ? ` — ${item.student.nickname}` : ''}` : '—'
          const goalTitle = item.goal?.title || '—'
          return (
            <li key={item.goalId}>
              <button
                type="button"
                className="home-attention-widget__row"
                onClick={() => goToStudent(item)}
                aria-label={`${studentLabel} — ${goalTitle} — ${reasonsText(item.reasons)}`}
              >
                <span className="home-attention-widget__student">{studentLabel}</span>
                <span className="home-attention-widget__goal-title">{goalTitle}</span>
                <span className="home-attention-widget__reasons">
                  {item.reasons.map((r) => {
                    const Icon = REASON_ICON[r.type]
                    return (
                      <span key={r.type} className={`home-attention-widget__reason home-attention-widget__reason--${r.type}`}>
                        {Icon && <Icon size={12} aria-hidden="true" />} {r.label}
                      </span>
                    )
                  })}
                </span>
              </button>
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
