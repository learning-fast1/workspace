import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { activeTable } from '../../migration/activeGeneration.js'
import { searchAll } from '../../utils/globalSearch.js'
import { formatDateEl } from '../../utils/date.js'
import Badge from '../ui/Badge.jsx'
import './HeaderSearch.css'

// Ενιαία (Google-like) global search — ΜΙΑ φορά πληκτρολόγηση, ομαδοποιημένα αποτελέσματα από ΟΛΕΣ
// τις κατηγορίες μαζί στο ίδιο panel (Product Design, review χρήστη). Καμία αποθήκευση query
// οπουδήποτε — `query`/`data` ζουν αποκλειστικά σε αυτό το component state, ephemeral, χάνονται
// στο κλείσιμο/unmount. Δεδομένα φορτώνονται lazy (πρώτη εστίαση), ΜΙΑ φορά ανά «συνεδρία» χρήσης
// του search — ίδιο batched Promise.all idiom με Home.jsx/TodayQueue.jsx, καμία query ανά πλήκτρο.
//
// Desktop/tablet (≥768px, βλ. HeaderSearch.css): inline input στο header, dropdown από κάτω.
// Mobile (<768px): μόνο ένα εικονίδιο-trigger στο header (βλ. COMPONENT_GUIDE.md §SearchBar — «στο
// mobile μπορεί να ανοίγει overlay/search view»)· το ίδιο results-panel αποδίδεται μέσα σε
// πλήρους-οθόνης overlay με δικό του input. Το ΙΔΙΟ πρόγραμμα δεδομένων/αποτελεσμάτων τροφοδοτεί
// και τα δύο, δεν φορτώνεται δύο φορές.
const DEBOUNCE_MS = 180

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

async function loadSearchData() {
  const [students, sessions, goals, reports] = await Promise.all([
    activeTable('students').toArray(),
    activeTable('sessions').toArray(),
    activeTable('goals').toArray(),
    activeTable('reports').toArray()
  ])
  return { students, sessions, goals, reports }
}

// Σειρά κατηγοριών ΣΤΑΘΕΡΗ, ίδια παντού (Product Design) — το ranking (exact/starts-with/contains)
// ισχύει ΜΟΝΟ μέσα σε κάθε κατηγορία, ΠΟΤΕ ανάμεσά τους.
const CATEGORY_ORDER = ['students', 'sessions', 'goals', 'reports']
const CATEGORY_LABEL = { students: 'Μαθητές', sessions: 'Συνεδρίες', goals: 'Στόχοι', reports: 'Αναφορές' }

function flattenResults(results) {
  if (!results) return []
  const flat = []
  for (const category of CATEGORY_ORDER) {
    for (const item of results[category].items) {
      flat.push({ category, item, optionId: `header-search-option-${category}-${item.id}` })
    }
  }
  return flat
}

function destinationFor(category, item) {
  switch (category) {
    case 'students':
      return { path: `/students/${item.id}` }
    case 'sessions':
      return { path: `/students/${item.studentIds[0]}`, state: { activeTab: 'sessions' } }
    case 'goals':
      return { path: `/students/${item.studentId}/goals/${item.id}` }
    case 'reports':
      return { path: `/students/${item.studentId}`, state: { activeTab: 'report' } }
    default:
      return null
  }
}

function ResultRow({ category, item, optionId, active, onSelect, onMouseEnter }) {
  let content
  if (category === 'students') {
    content = (
      <>
        <span className="header-search__row-primary">{item.code}{item.nickname ? ` — ${item.nickname}` : ''}</span>
        {!item.active && <Badge variant="neutral">Αρχειοθετημένος</Badge>}
      </>
    )
  } else if (category === 'sessions') {
    content = (
      <>
        <span className="header-search__row-primary">{formatDateEl(item.date)} — {item.studentLabel}</span>
        {(item.activity || item.note) && (
          <span className="header-search__row-secondary">{item.activity || item.note}</span>
        )}
      </>
    )
  } else if (category === 'goals') {
    content = (
      <>
        <span className="header-search__row-primary">{item.title}</span>
        <span className="header-search__row-secondary">{item.studentCode}</span>
        {item.domainLabel && <Badge variant="neutral">{item.domainLabel}</Badge>}
      </>
    )
  } else {
    content = (
      <>
        <span className="header-search__row-primary">{item.studentCode} · {formatDateEl(item.dateFrom)}–{formatDateEl(item.dateTo)}</span>
        {item.snippet && <span className="header-search__row-secondary">{item.snippet}</span>}
        {/* Ίδιο vocabulary/χρώμα με το ReportTab.jsx (καμία κοινή helper υπάρχει σήμερα — inline εκεί επίσης). */}
        <Badge variant={item.status === 'final' ? 'success' : 'neutral'}>{item.status === 'final' ? 'Τελική' : 'Πρόχειρη'}</Badge>
      </>
    )
  }

  return (
    <li
      id={optionId}
      role="option"
      aria-selected={active}
      className={`header-search__row ${active ? 'header-search__row--active' : ''}`}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      {content}
    </li>
  )
}

function ResultsPanel({ results, flat, activeOptionId, onSelect, query }) {
  if (!query) return null

  const totalCount = CATEGORY_ORDER.reduce((sum, c) => sum + results[c].total, 0)
  if (totalCount === 0) {
    return (
      <div className="header-search__empty">
        <p>Κανένα αποτέλεσμα για «{query}»</p>
        <p className="header-search__empty-hint">Δοκίμασε κωδικό μαθητή, τίτλο στόχου, ή περιεχόμενο σημείωσης/αναφοράς.</p>
      </div>
    )
  }

  return (
    <ul id="header-search-listbox" role="listbox" aria-label="Αποτελέσματα αναζήτησης" className="header-search__list">
      {CATEGORY_ORDER.map((category) => {
        const { items, total } = results[category]
        if (items.length === 0) return null
        return (
          <li key={category} role="group" aria-label={CATEGORY_LABEL[category]} className="header-search__group">
            <p className="header-search__group-heading">
              {CATEGORY_LABEL[category]}{total > items.length ? ` (${total})` : ''}
            </p>
            <ul className="header-search__group-list">
              {items.map((item) => {
                const optionId = `header-search-option-${category}-${item.id}`
                return (
                  <ResultRow
                    key={optionId}
                    category={category}
                    item={item}
                    optionId={optionId}
                    active={optionId === activeOptionId}
                    onSelect={() => onSelect(category, item)}
                    onMouseEnter={() => {}}
                  />
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

export default function HeaderSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef(null)
  const desktopInputRef = useRef(null)
  const mobileInputRef = useRef(null)

  const debouncedQuery = useDebouncedValue(query, DEBOUNCE_MS)
  const results = useMemo(() => searchAll(debouncedQuery, data || {}), [debouncedQuery, data])
  const flat = useMemo(() => flattenResults(results), [results])

  useEffect(() => {
    setActiveIndex(flat.length > 0 ? 0 : -1)
  }, [flat.length, debouncedQuery])

  function ensureDataLoaded() {
    if (data === null) loadSearchData().then(setData)
  }

  function openDesktop() {
    ensureDataLoaded()
    setDesktopOpen(true)
  }

  function openMobile() {
    ensureDataLoaded()
    setMobileOpen(true)
    // Το overlay μόλις μπήκε στο DOM — εστίαση στο επόμενο tick.
    requestAnimationFrame(() => mobileInputRef.current?.focus())
  }

  function closeAll() {
    setDesktopOpen(false)
    setMobileOpen(false)
  }

  function resetAndClose() {
    setQuery('')
    closeAll()
  }

  function goTo(category, item) {
    const destination = destinationFor(category, item)
    if (!destination) return
    resetAndClose()
    navigate(destination.path, destination.state ? { state: destination.state } : undefined)
  }

  // Click εκτός κλείνει ΜΟΝΟ το desktop dropdown (το mobile overlay έχει δικό του ρητό «Άκυρο»/backdrop).
  useEffect(() => {
    if (!desktopOpen) return
    function handlePointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setDesktopOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [desktopOpen])

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (mobileOpen) {
        setMobileOpen(false)
      } else {
        setDesktopOpen(false)
        desktopInputRef.current?.blur()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (flat.length > 0) setActiveIndex((i) => (i + 1) % flat.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (flat.length > 0) setActiveIndex((i) => (i - 1 + flat.length) % flat.length)
      return
    }
    if (e.key === 'Enter') {
      const current = flat[activeIndex]
      if (current) {
        e.preventDefault()
        goTo(current.category, current.item)
      }
    }
  }

  const activeOptionId = flat[activeIndex]?.optionId

  return (
    <div className="header-search" ref={containerRef}>
      {/* Desktop/tablet — ίδια θέση με το προηγούμενο (πλέον πραγματικά λειτουργικό) input. */}
      <div className="header-search__inline">
        <Search size={18} className="header-search__icon" aria-hidden="true" />
        <input
          ref={desktopInputRef}
          type="text"
          role="combobox"
          aria-expanded={desktopOpen && !!query}
          aria-controls="header-search-listbox"
          aria-activedescendant={desktopOpen ? activeOptionId : undefined}
          aria-autocomplete="list"
          aria-label="Αναζήτηση μαθητών, συνεδριών, στόχων, αναφορών"
          placeholder="Αναζήτηση…"
          value={query}
          onFocus={openDesktop}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button type="button" className="header-search__clear" aria-label="Καθαρισμός αναζήτησης" onClick={() => setQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>
      {desktopOpen && (
        <div className="header-search__dropdown">
          <ResultsPanel results={results} flat={flat} activeOptionId={activeOptionId} onSelect={goTo} query={debouncedQuery} />
        </div>
      )}

      {/* Mobile — μόνο trigger εικονίδιο (βλ. HeaderSearch.css), ανοίγει πλήρους-οθόνης overlay. */}
      <button type="button" className="header-search__mobile-trigger" aria-label="Αναζήτηση" onClick={openMobile}>
        <Search size={20} />
      </button>

      {/* createPortal στο document.body (QA εύρημα #1): το .app-shell-header είναι sticky ΜΕ δικό
          του z-index — δημιουργεί νέο stacking context, άρα οτιδήποτε z-index έχει το overlay ΜΕΣΑ
          σε αυτό συγκρίνεται ΜΟΝΟ εντός του, ποτέ με το BottomNav (sibling ΕΚΤΟΣ του
          .app-shell-header, renders ΜΕΤΑ σε DOM σειρά) — επιβεβαιώθηκε live: χωρίς portal το
          BottomNav/FAB ζωγραφίζονταν ΠΑΝΩ από το «πλήρους οθόνης» overlay.

          Wrapper className="app-shell" (QA εύρημα #2): τα design tokens (--color-surface,
          --shell-header-height, --space-*, ...) είναι ΣΚΟΠΙΣΜΕΝΑ στην κλάση .app-shell, ΟΧΙ στο
          :root (βλ. src/design/tokens.css) — ένα portal κατευθείαν στο document.body βγαίνει ΕΚΤΟΣ
          του DOM subtree του .app-shell, άρα χάνει την κληρονομιά αυτών των custom properties
          (επιβεβαιώθηκε live: εντελώς διάφανο background, μηδέν spacing). Το τοπικό .app-shell
          wrapper τα ξαναφέρνει σε scope χωρίς να χρειάζεται DOM query για το πραγματικό root.
          display:contents (inline, νικά το .app-shell CSS min-height:100vh/display:flex) — το ίδιο
          το wrapper δεν παράγει κανένα δικό του box/layout, μόνο περνάει τα custom properties προς
          τα κάτω· το πραγματικό positioning το κάνει το .header-search__overlay (position:fixed). */}
      {mobileOpen && createPortal(
        <div className="app-shell" style={{ display: 'contents' }}>
          <div className="header-search__overlay" role="dialog" aria-modal="true" aria-label="Αναζήτηση">
            <div className="header-search__overlay-bar">
              <Search size={18} className="header-search__icon" aria-hidden="true" />
              <input
                ref={mobileInputRef}
                type="text"
                role="combobox"
                aria-expanded={!!query}
                aria-controls="header-search-listbox"
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
                aria-label="Αναζήτηση μαθητών, συνεδριών, στόχων, αναφορών"
                placeholder="Αναζήτηση…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button type="button" className="header-search__cancel" onClick={resetAndClose}>Άκυρο</button>
            </div>
            <div className="header-search__overlay-results">
              <ResultsPanel results={results} flat={flat} activeOptionId={activeOptionId} onSelect={goTo} query={debouncedQuery} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
