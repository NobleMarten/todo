import type { DateStr } from '../api/types'
import { addDays, dateLabel } from '../lib/date'
import { CloseIcon } from './icons'

interface Props {
  label: string
  value: DateStr | null
  today: DateStr
  onChange: (v: DateStr | null) => void
  danger?: boolean // подсветить просроченное значение
}

/**
 * Поле календарной даты: чип со значением поверх нативного <input type="date">
 * (на iPhone — родное колесо) и быстрые «сегодня» / «завтра» / «убрать».
 */
export function DatePicker({ label, value, today, onChange, danger }: Props) {
  const tomorrow = addDays(today, 1)

  return (
    <div className="date-field">
      <div className="field-label">{label}</div>
      <div className="date-controls">
        <label className={`chip date-chip ${value ? 'set' : ''} ${danger ? 'danger' : ''}`}>
          {value ? dateLabel(value, today) : 'выбрать'}
          <input
            type="date"
            className="date-native"
            value={value ?? ''}
            aria-label={label}
            onClick={(e) => {
              // в десктопном Chrome клик по полю сам календарь не открывает
              try {
                e.currentTarget.showPicker()
              } catch {
                /* не поддерживается — остаётся обычный ввод */
              }
            }}
            onChange={(e) => onChange(e.target.value || null)}
          />
        </label>
        {value !== today && (
          <button className="chip" onClick={() => onChange(today)}>
            сегодня
          </button>
        )}
        {value !== tomorrow && (
          <button className="chip" onClick={() => onChange(tomorrow)}>
            завтра
          </button>
        )}
        {value && (
          <button className="chip chip-icon" onClick={() => onChange(null)} aria-label={`убрать: ${label}`}>
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  )
}
