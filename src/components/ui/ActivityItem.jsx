import { Link } from 'react-router-dom'
import './ActivityItem.css'

// Μία γραμμή σε ένα χρονολογικό feed (COMPONENT_GUIDE.md § ActivityItem) — icon, τίτλος,
// timestamp, προαιρετικό link. `milestone` δίνει διακριτική οπτική έμφαση (SPEC.md: οι
// παρατηρήσεις-milestone «ξεχωρίζουν οπτικά»), όχι απλά διαφορετικό icon.
export default function ActivityItem({ icon: Icon, text, dateLabel, to, milestone }) {
  const content = (
    <>
      <span className="activity-item__icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="activity-item__text">{text}</span>
      <span className="activity-item__date">{dateLabel}</span>
    </>
  )

  const className = `activity-item ${milestone ? 'activity-item--milestone' : ''}`

  if (to) {
    return (
      <Link to={to} className={`${className} activity-item--link`}>
        {content}
      </Link>
    )
  }

  return <div className={className}>{content}</div>
}
