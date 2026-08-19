import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { activeTable, withNewRowId } from '../migration/activeGeneration.js'
import './TodoList.css'

// Προσωπική λίστα εργασιών στην Αρχική (review χρήστη — «εύκολα προσβάσιμο, να μπορεί να
// χρησιμοποιεί οποτεδήποτε με check list»). Τοπικό, ανεξάρτητο περιεχόμενο — καμία σχέση με
// μαθητές/στόχους/συνεδρίες. Απλή χρονολογική σειρά (createdAt) — τα ολοκληρωμένα παραμένουν στη
// θέση τους, με διαγράμμιση, αντί να μετακινούνται (λιγότερη οπτική αναταραχή σε κάθε check).
async function loadTodos() {
  return activeTable('todos').orderBy('createdAt').toArray()
}

export default function TodoList() {
  const todos = useLiveQuery(loadTodos, [])
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setAdding(true)
    try {
      await activeTable('todos').add(withNewRowId({ text: trimmed, done: false, createdAt: new Date().toISOString() }))
      setText('')
    } finally {
      setAdding(false)
    }
  }

  async function handleToggle(todo) {
    await activeTable('todos').update(todo.id, { done: !todo.done })
  }

  async function handleDelete(id) {
    await activeTable('todos').delete(id)
  }

  if (!todos) {
    return (
      <section className="todo-list" aria-labelledby="todoListHeading">
        <h2 id="todoListHeading" className="todo-list__title">Λίστα εργασιών</h2>
        <p className="todo-list__loading">Φόρτωση…</p>
      </section>
    )
  }

  const remaining = todos.filter((t) => !t.done).length

  return (
    <section className="todo-list" aria-labelledby="todoListHeading">
      <div className="todo-list__header">
        <h2 id="todoListHeading" className="todo-list__title">Λίστα εργασιών</h2>
        {todos.length > 0 && (
          <span className="todo-list__count">{remaining > 0 ? `${remaining} εκκρεμείς` : 'Όλα ολοκληρωμένα'}</span>
        )}
      </div>

      <form className="todo-list__form" onSubmit={handleAdd}>
        <input
          type="text"
          className="todo-list__input"
          placeholder="Νέα εργασία…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Νέα εργασία"
        />
        <button type="submit" className="todo-list__add" disabled={!text.trim() || adding} aria-label="Προσθήκη εργασίας">
          <Plus size={18} aria-hidden="true" />
        </button>
      </form>

      {todos.length === 0 && (
        <p className="todo-list__empty">Καμία εργασία ακόμα — πρόσθεσε την πρώτη σου παραπάνω.</p>
      )}

      {todos.length > 0 && (
        <ul className="todo-list__items">
          {todos.map((todo) => (
            <li key={todo.id} className="todo-list__item">
              <label className="todo-list__item-label">
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => handleToggle(todo)}
                  aria-label={`${todo.text} — ${todo.done ? 'ολοκληρωμένη, πάτησε για επαναφορά' : 'εκκρεμής, πάτησε για ολοκλήρωση'}`}
                />
                <span className={`todo-list__item-text ${todo.done ? 'todo-list__item-text--done' : ''}`}>{todo.text}</span>
              </label>
              <button
                type="button"
                className="todo-list__delete"
                onClick={() => handleDelete(todo.id)}
                aria-label={`Διαγραφή εργασίας — ${todo.text}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
