import { Link } from 'react-router-dom'
import './ActivityItem.css'

// Μία γραμμή σε ένα χρονολογικό feed (COMPONENT_GUIDE.md § ActivityItem) — icon, τίτλος,
// timestamp, προαιρετικό link. `milestone` δίνει διακριτική οπτική έμφαση (SPEC.md: οι
// παρατηρήσεις-milestone «ξεχωρίζουν οπτικά»), όχι απλά διαφορετικό icon.
//
// `to` (πλοήγηση, React Router Link) και `onClick` (π.χ. άνοιγμα modal, βλ. GoalDetail.jsx) είναι
// αμοιβαία αποκλειστικά — δίνεται ΤΟ ΠΟΛΥ ένα από τα δύο ανά χρήση. `kind` (προαιρετικό — π.χ.
// 'measurement'/'assessment') δίνει καθαρά οπτική διαφοροποίηση οικογένειας γραμμής μέσω CSS,
// καμία επίδραση στη συμπεριφορά.
export default function ActivityItem({ icon: Icon, text, dateLabel, to, onClick, milestone, kind }) {
  const content = (
    <>
      <span className="activity-item__icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="activity-item__text">{text}</span>
      <span className="activity-item__date">{dateLabel}</span>
    </>
  )

  const className = `activity-item ${milestone ? 'activity-item--milestone' : ''} ${kind ? `activity-item--${kind}` : ''}`.trim()

  if (to) {
    return (
      <Link to={to} className={`${className} activity-item--link`}>
        {content}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} activity-item--link`}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}
