import { ArrowLeft, Archive, ArchiveRestore, CalendarDays, CircleCheck, Pencil, PlayCircle, Target, Trash2 } from 'lucide-react'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import Button from './ui/Button.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import StatCard from './ui/StatCard.jsx'
import './StudentProfileHero.css'

// Καθαρά presentational — καμία query. Όλα τα στατιστικά έρχονται ήδη υπολογισμένα/μορφοποιημένα
// από το StudentProfile (ίδιο μοτίβο με το StudentCard/StudentList).
export default function StudentProfileHero({
  code,
  nickname,
  grade,
  active,
  activeGoalsCount,
  totalSessions,
  goalsAtCriterionLabel,
  lastSessionLabel,
  sessionTo,
  onBack,
  onEdit,
  onToggleActive,
  onDelete
}) {
  const initial = code ? code.charAt(0).toUpperCase() : '?'

  return (
    <Card className="profile-hero">
      <button type="button" className="profile-hero__back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        Πίσω
      </button>

      <div className="profile-hero__top">
        <div className="profile-hero__identity">
          <span className="profile-hero__avatar" aria-hidden="true">{initial}</span>
          <div className="profile-hero__identity-text">
            <div className="profile-hero__name-row">
              <h1 className="profile-hero__code">{code}</h1>
              {!active && <Badge variant="neutral">Αρχειοθετημένος</Badge>}
            </div>
            {nickname && <p className="profile-hero__nickname">{nickname}</p>}
            {grade && <p className="profile-hero__grade">{grade}</p>}
          </div>
        </div>

        <div className="profile-hero__actions">
          <Button variant="secondary" icon={Pencil} onClick={onEdit}>Επεξεργασία στοιχείων</Button>
          <Button variant="primary" icon={PlayCircle} to={sessionTo}>Νέα συνεδρία</Button>
          <OverflowMenu
            ariaLabel={`Ενέργειες για ${code}`}
            items={[
              active
                ? { label: 'Αρχειοθέτηση', icon: Archive, onClick: onToggleActive }
                : { label: 'Επαναφορά', icon: ArchiveRestore, onClick: onToggleActive },
              { label: 'Διαγραφή', icon: Trash2, onClick: onDelete, variant: 'danger' }
            ]}
          />
        </div>
      </div>

      <div className="profile-hero__stats">
        <StatCard icon={Target} label="Ενεργοί στόχοι" value={activeGoalsCount} />
        <StatCard icon={CalendarDays} label="Συνεδρίες" value={totalSessions} />
        <StatCard icon={CircleCheck} label="Στόχοι στο κριτήριο" value={goalsAtCriterionLabel} />
        <StatCard icon={CalendarDays} label="Τελευταία συνεδρία" value={lastSessionLabel} />
      </div>
    </Card>
  )
}
