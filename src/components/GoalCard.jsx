import { Link } from 'react-router-dom'
import { Pencil, RefreshCcw, CalendarClock, BookmarkPlus, Copy } from 'lucide-react'
import { PRIORITY_BADGE_VARIANT, STATUS_BADGE_VARIANT } from '../config/goalOptions.js'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import ProgressBar from './ui/ProgressBar.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import './GoalCard.css'

// Καθαρά presentational — καμία query. Όλα τα δεδομένα (progressPercent/progressLabel ήδη
// κανονικοποιημένα, lastMeasuredLabel ήδη μορφοποιημένο) υπολογίζονται συγκεντρωτικά στο
// GoalsList (ένα query ανά πίνακα για όλους τους στόχους, όχι ένα ανά κάρτα).
export default function GoalCard({
  id,
  studentId,
  title,
  domainLabel,
  description,
  criterion,
  priority,
  priorityLabel,
  status,
  statusLabel,
  progressPercent,
  progressLabel,
  lastMeasuredLabel,
  isStale,
  onEdit,
  onOpenStatusModal,
  onSaveAsTemplate,
  onCopyToStudent
}) {
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
          items={[
            { label: 'Επεξεργασία', icon: Pencil, onClick: onEdit },
            { label: 'Αλλαγή κατάστασης', icon: RefreshCcw, onClick: onOpenStatusModal },
            { label: 'Αποθήκευσε ως πρότυπο', icon: BookmarkPlus, onClick: onSaveAsTemplate },
            { label: 'Αντιγραφή σε άλλον μαθητή', icon: Copy, onClick: onCopyToStudent }
          ]}
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

      {/* Πάντα ορατό όταν υπάρχει (Minor UX Polish, bug report) — ο δάσκαλος με πολλούς ενεργούς
          στόχους πρέπει να βλέπει το κριτήριο επιτυχίας απευθείας εδώ, χωρίς να ανοίγει κάθε
          Goal Detail ξεχωριστά. Πριν ήταν εντελώς αόρατο στην κάρτα. */}
      {criterion && (
        <div className="goal-card2__criterion">
          <p className="goal-card2__criterion-label">Κριτήριο</p>
          <p className="goal-card2__criterion-text">{criterion}</p>
        </div>
      )}

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
