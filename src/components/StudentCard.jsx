import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, CalendarDays, Pencil, Target, Trash2 } from 'lucide-react'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import OverflowMenu from './ui/OverflowMenu.jsx'
import './StudentCard.css'

// Καθαρά presentational — καμία Dexie query, κανένα useLiveQuery, καμία business logic. Όλα τα
// δεδομένα (activeGoalsCount, ήδη μορφοποιημένο lastSessionLabel) υπολογίζονται συγκεντρωτικά
// στο StudentList (ΕΝΑ query ανά πίνακα για όλους τους μαθητές, όχι ένα ανά κάρτα).
//
// props:
//   id, code, nickname, grade, active — πεδία του μαθητή
//   activeGoalsCount: number
//   lastSessionLabel: string — ήδη μορφοποιημένο κείμενο (π.χ. "12 Ιουλ 2026" ή "Καμία συνεδρία ακόμα")
//   onEdit, onToggleActive, onDelete: () => void
export default function StudentCard({
  id,
  code,
  nickname,
  grade,
  active,
  activeGoalsCount,
  lastSessionLabel,
  onEdit,
  onToggleActive,
  onDelete
}) {
  const initial = code ? code.charAt(0).toUpperCase() : '?'

  return (
    <Card variant="interactive" className="student-tile">
      {/* Καλύπτει ολόκληρη την κάρτα (.stretched-link, βλ. ui/Card.css) — αδελφό στοιχείο με το
          OverflowMenu στο DOM, όχι εμφωλευμένο, ώστε να αποφεύγεται άκυρο <button> μέσα σε <a>. */}
      <Link to={`/students/${id}`} className="stretched-link student-tile__link" aria-label={`Άνοιγμα προφίλ ${code}`} />

      <div className="student-tile__top">
        <span className="student-tile__avatar" aria-hidden="true">{initial}</span>
        <div className="student-tile__identity">
          <p className="student-tile__code">{code}</p>
          {nickname && <p className="student-tile__nickname">{nickname}</p>}
        </div>
        <OverflowMenu
          ariaLabel={`Ενέργειες για ${code}`}
          items={[
            { label: 'Επεξεργασία', icon: Pencil, onClick: onEdit },
            active
              ? { label: 'Αρχειοθέτηση', icon: Archive, onClick: onToggleActive }
              : { label: 'Επαναφορά', icon: ArchiveRestore, onClick: onToggleActive },
            { label: 'Διαγραφή', icon: Trash2, onClick: onDelete, variant: 'danger' }
          ]}
        />
      </div>

      {grade && <p className="student-tile__grade">{grade}</p>}

      <div className="student-tile__stats">
        <span className="student-tile__stat">
          <Target size={14} aria-hidden="true" />
          {activeGoalsCount} {activeGoalsCount === 1 ? 'ενεργός στόχος' : 'ενεργοί στόχοι'}
        </span>
        <span className="student-tile__stat">
          <CalendarDays size={14} aria-hidden="true" />
          {lastSessionLabel}
        </span>
      </div>

      {!active && <Badge variant="neutral">Αρχειοθετημένος</Badge>}
    </Card>
  )
}
