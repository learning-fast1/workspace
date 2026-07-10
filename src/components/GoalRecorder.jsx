import { PROMPT_LEVELS } from '../config/promptLevels.js'

// Καταχώρηση με ένα tap, προσαρμοσμένη στον τύπο μέτρησης του στόχου.
// value: η συσσωρευμένη τιμή αυτής της συνεδρίας (μέχρι να πατηθεί «Τέλος»).
export default function GoalRecorder({ goal, value, onChange }) {
  if (goal.measurementType === 'successRatio') {
    const successes = value?.successes || 0
    const attempts = value?.attempts || 0
    return (
      <div className="recorder">
        <div className="recorder-row">
          <button
            type="button"
            className="btn recorder-btn recorder-success"
            onClick={() => onChange({ successes: successes + 1, attempts: attempts + 1 })}
          >
            ✓ Επιτυχία
          </button>
          <button
            type="button"
            className="btn recorder-btn recorder-fail"
            onClick={() => onChange({ successes, attempts: attempts + 1 })}
          >
            ✗ Δυσκολία
          </button>
        </div>
        <p className="recorder-tally">{successes} / {attempts}</p>
      </div>
    )
  }

  if (goal.measurementType === 'promptLevel') {
    const level = value?.level
    return (
      <div className="recorder">
        <div className="recorder-row recorder-row-wrap">
          {PROMPT_LEVELS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`btn recorder-btn ${level === p.value ? 'recorder-btn-active' : 'btn-secondary'}`}
              onClick={() => onChange({ level: p.value })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (goal.measurementType === 'duration') {
    const minutes = value?.minutes || 0
    return (
      <div className="recorder">
        <div className="recorder-row">
          <button type="button" className="btn recorder-btn" onClick={() => onChange({ minutes: minutes + 1 })}>+1 λεπτό</button>
          <button type="button" className="btn recorder-btn" onClick={() => onChange({ minutes: minutes + 5 })}>+5 λεπτά</button>
        </div>
        <p className="recorder-tally">{minutes} λεπτά</p>
      </div>
    )
  }

  if (goal.measurementType === 'taskAnalysis') {
    const stepsCompleted = value?.stepsCompleted || 0
    return (
      <div className="recorder">
        <div className="recorder-row">
          <button
            type="button"
            className="btn recorder-btn"
            disabled={stepsCompleted === 0}
            onClick={() => onChange({ stepsCompleted: Math.max(0, stepsCompleted - 1) })}
          >
            −
          </button>
          <span className="recorder-tally">{stepsCompleted} βήματα</span>
          <button
            type="button"
            className="btn recorder-btn"
            onClick={() => onChange({ stepsCompleted: stepsCompleted + 1 })}
          >
            +
          </button>
        </div>
      </div>
    )
  }

  return null
}
