import { Link } from 'react-router-dom'
import { CalendarClock, Pencil } from 'lucide-react'
import { STATUSES } from '../config/goalOptions.js'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import ProgressBar from './ui/ProgressBar.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import './GoalCard.css'

const PRIORITY_BADGE_VARIANT = { high: 'danger', medium: 'warning', low: 'neutral' }
const STATUS_BADGE_VARIANT = { active: 'primary', achieved: 'success', revised: 'warning', archived: 'neutral' }

// Καθαρά presentational — καμία query. Όλα τα δεδομένα (progressPercent/progressLabel ήδη
// κανονικοποιημένα, lastMeasuredLabel ήδη μορφοποιημένο) υπολογίζονται συγκεντρωτικά στο
// GoalsList (ένα query ανά πίνακα για όλους τους στόχους, όχι ένα ανά κάρτα).
export default function GoalCard({
  id,
  studentId,
  title,
  domainLabel,
  description,
  priority,
  priorityLabel,
  status,
  statusLabel,
  progressPercent,
  progressLabel,
  lastMeasuredLabel,
  isStale,
  onEdit,
  onChangeStatus
}) {
  // Overflow: πάντα Επεξεργασία + οι ΥΠΟΛΟΙΠΕΣ 3 καταστάσεις (εκτός της τρέχουσας) — ίδια πλήρης
  // ευελιξία με το παλιό <select> με τις 4 επιλογές, απλά σε overflow menu αντί για dropdown.
  const statusItems = STATUSES.filter((s) => s.value !== status).map((s) => ({
    label: `Σήμανση ως ${s.label}`,
    onClick: () => onChangeStatus(s.value)
  }))

  return (
    <Card variant="interactive" className="goal-card2">
      <Link to={`/students/${studentId}/goals/${id}`} className="stretched-link goal-card2__link" aria-label={`Πρόοδος στόχου ${title}`} />

      <div className="goal-card2__top">
        <div className="goal-card2__identity">
          <p className="goal-card2__title">{title}</p>
          <p className="goal-card2__domain">{domainLabel}</p>
        </div>
        <OverflowMenu
          ariaLabel={`Ενέργειες για ${title}`}
          items={[{ label: 'Επεξεργασία', icon: Pencil, onClick: onEdit }, ...statusItems]}
        />
      </div>

      {description && <p className="goal-card2__description">{description}</p>}

      <div className="goal-card2__badges">
        <Badge variant={PRIORITY_BADGE_VARIANT[priority] || 'neutral'}>{priorityLabel}</Badge>
        <Badge variant={STATUS_BADGE_VARIANT[status] || 'neutral'}>{statusLabel}</Badge>
        {isStale && (
          <span className="goal-card2__stale">
            <CalendarClock size={12} aria-hidden="true" />
            Χωρίς μέτρηση 14+ μέρες
          </span>
        )}
      </div>

      <div className="goal-card2__progress">
        {progressPercent !== null ? (
          <ProgressBar value={progressPercent} />
        ) : progressLabel ? (
          <p className="goal-card2__progress-label">{progressLabel}</p>
        ) : (
          <p className="goal-card2__progress-label goal-card2__progress-label--muted">Καμία μέτρηση ακόμα</p>
        )}
        {lastMeasuredLabel && <p className="goal-card2__last-measured">{lastMeasuredLabel}</p>}
      </div>
    </Card>
  )
}
