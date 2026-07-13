import './FormField.css'

// Layout wrapper γύρω από ένα πεδίο — label, required indicator, helper/error κείμενο. Δεν ξέρει
// τίποτα για το πραγματικό input/textarea (έρχεται ως children) — καθαρά presentational.
// Παράγει ids `${htmlFor}-helper` / `${htmlFor}-error` — ο καλών (π.χ. StudentForm) είναι υπεύθυνος
// να τα συνδέσει με aria-describedby στο πραγματικό πεδίο.
export default function FormField({ htmlFor, label, required, helperText, error, children }) {
  return (
    <div className="form-field">
      <label htmlFor={htmlFor} className="form-field__label">
        {label}
        {required && <span className="form-field__required" aria-hidden="true">*</span>}
      </label>
      {children}
      {!error && helperText && (
        <p className="form-field__helper" id={`${htmlFor}-helper`}>{helperText}</p>
      )}
      {error && (
        <p className="form-field__error" id={`${htmlFor}-error`} role="alert">{error}</p>
      )}
    </div>
  )
}
