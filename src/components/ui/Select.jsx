import { forwardRef } from 'react'
import './Select.css'

// Για λίστες σταθερών επιλογών (COMPONENT_GUIDE.md § Select) — καμία business logic, καμία query.
// Ίδιο μοτίβο με το Input/Textarea (forwardRef, error state, passthrough props).
const Select = forwardRef(function Select({ error, className = '', children, ...rest }, ref) {
  return (
    <select ref={ref} className={`select ${error ? 'select--error' : ''} ${className}`.trim()} {...rest}>
      {children}
    </select>
  )
})

export default Select
