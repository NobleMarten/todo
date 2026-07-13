import { useState } from 'react'
import type { FilterDone } from '../api'
import { CalendarIcon } from './icons'

interface Props {
  filter: FilterDone
  setFilter: (f: FilterDone) => void
  from: string
  setFrom: (v: string) => void
  to: string
  setTo: (v: string) => void
}

const FILTERS: { value: FilterDone; label: string }[] = [
  { value: 'all', label: 'все' },
  { value: 'false', label: 'активные' },
  { value: 'true', label: 'готово' },
]

export function Filters({ filter, setFilter, from, setFrom, to, setTo }: Props) {
  const [showDatePicker, setShowDatePicker] = useState(false)
  const hasDates = Boolean(from || to)

  return (
    <div className="filters">
      <div className="filter-group" role="group" aria-label="Фильтр по статусу">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-btn ${filter === f.value ? 'active' : ''}`}
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="filter-group date-toggle-group">
        <button
          className={`date-toggle-btn ${showDatePicker ? 'active' : ''} ${hasDates ? 'has-dates' : ''}`}
          onClick={() => setShowDatePicker((v) => !v)}
          aria-label="Фильтр по дате"
          aria-expanded={showDatePicker}
        >
          <CalendarIcon />
          {hasDates && <span className="date-badge" />}
        </button>

        {showDatePicker && (
          <div className="date-dropdown">
            <input
              type="date"
              className="date-input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="С даты"
            />
            <span className="date-sep">—</span>
            <input
              type="date"
              className="date-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="По дату"
            />
            {hasDates && (
              <button
                className="clear-date"
                onClick={() => {
                  setFrom('')
                  setTo('')
                }}
                aria-label="Сбросить даты"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
