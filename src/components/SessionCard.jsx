import { Clock, Copy, Eye, Pencil, Trash2 } from 'lucide-react'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import { sessionStatusLabel, SESSION_STATUS_BADGE_VARIANT } from '../config/sessionOptions.js'
import './SessionCard.css'

// Καθαρά presentational — καμία query. `students`: [{ id, code, absent }], ήδη υπολογισμένο από
// τον γονέα (SessionHistory), ίδιο μοτίβο με StudentCard/GoalCard (ένα query ανά πίνακα στον
// γονέα, όχι ένα ανά κάρτα). Το «άνοιγμα λεπτομερειών» καλύπτει όλη την κάρτα (ίδιο stretched-link
// μοτίβο με StudentCard/GoalCard — εδώ πάνω σε <button> αντί για <Link> γιατί ανοίγει modal, όχι
// νέο route· η κλάση .stretched-link είναι καθαρά θέση/z-index/focus, δεν εξαρτάται από Link).
export default function SessionCard({
  dateLabel,
  durationMinutes,
  status,
  students,
  activity,
  note,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate
}) {
  const preview = activity || note

  return (
    <Card variant="interactive" className="session-card">
      <button
        type="button"
        className="stretched-link session-card__open"
        onClick={onOpen}
        aria-label={`Λεπτομέρειες συνεδρίας ${dateLabel}`}
      />

      <div className="session-card__top">
        <div className="session-card__identity">
          <p className="session-card__date">{dateLabel}</p>
          <div className="session-card__students">
            {students.map((s) => (
              <span key={s.id} className={`session-card__student ${s.absent ? 'session-card__student--absent' : ''}`}>
                {s.code}
              </span>
            ))}
          </div>
        </div>
        <OverflowMenu
          ariaLabel={`Ενέργειες για συνεδρία ${dateLabel}`}
          items={[
            { label: 'Προβολή', icon: Eye, onClick: onOpen },
            { label: 'Επεξεργασία', icon: Pencil, onClick: onEdit },
            ...(onDuplicate ? [{ label: 'Νέα συνεδρία με ίδιους μαθητές', icon: Copy, onClick: onDuplicate }] : []),
            { label: 'Διαγραφή', icon: Trash2, onClick: onDelete, variant: 'danger' }
          ]}
        />
      </div>

      <div className="session-card__meta">
        {/* Badge μόνο για την εξαίρεση (διακόπηκε/δεν πραγματοποιήθηκε) — η προεπιλογή «Ολοκληρώθηκε»
            σε κάθε κάρτα δεν πρόσθετε πραγματική πληροφορία, μόνο οπτικό θόρυβο (Sprint 4 UX review). */}
        {status !== 'completed' && (
          <Badge variant={SESSION_STATUS_BADGE_VARIANT[status] || 'neutral'}>{sessionStatusLabel(status)}</Badge>
        )}
        {durationMinutes != null && (
          <span className="session-card__duration">
            <Clock size={12} aria-hidden="true" />
            {durationMinutes}′
          </span>
        )}
      </div>

      {preview && <p className="session-card__preview">{preview}</p>}
    </Card>
  )
}
