import { forwardRef } from 'react'
import './Textarea.css'

// Ίδιο μοτίβο με το Input, για πολυγραμμικό κείμενο (σημειώσεις/παρατηρήσεις/περιγραφές).
const Textarea = forwardRef(function Textarea({ error, className = '', ...rest }, ref) {
  return (
    <textarea ref={ref} className={`textarea ${error ? 'textarea--error' : ''} ${className}`.trim()} {...rest} />
  )
})

export default Textarea
