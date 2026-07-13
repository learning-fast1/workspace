import { forwardRef } from 'react'
import './Input.css'

// Απλό, ελεγχόμενο text input — καμία business logic, καμία query. Forward ref ώστε ο γονέας να
// μπορεί να καλέσει .focus() προγραμματιστικά (π.χ. μετά από validation error). `error` (boolean)
// αλλάζει μόνο το οπτικό state — το ίδιο το μήνυμα σφάλματος αποδίδεται από το FormField.
const Input = forwardRef(function Input({ error, className = '', ...rest }, ref) {
  return (
    <input ref={ref} className={`input ${error ? 'input--error' : ''} ${className}`.trim()} {...rest} />
  )
})

export default Input
