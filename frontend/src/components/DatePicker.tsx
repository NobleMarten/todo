import type { DateStr } from '../api/types'
import { fieldDateLabel, relativeLabel } from '../lib/date'
import { ChevronIcon, CloseIcon, FlagIcon, WeekIcon } from './icons'

interface NativeProps {
  value: DateStr | null
  label: string
  onChange: (v: DateStr | null) => void
}

/**
 * Прозрачный <input type="date"> поверх родителя: тап открывает системный выбор даты
 * (на iPhone — колесо). Родитель должен быть position: relative.
 */
export function NativeDateInput({ value, label, onChange }: NativeProps) {
  return (
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
  )
}

interface Props {
  kind: 'due' | 'scheduled'
  label: string
  value: DateStr | null
  today: DateStr
  onChange: (v: DateStr | null) => void
}

/**
 * Поле даты карточки (макет C2): иконка, подпись, значение «4 октября, сб».
 * У дедлайна — сколько осталось. Заданную дату убирает крестик справа (вместо шеврона из макета).
 */
export function DatePicker({ kind, label, value, today, onChange }: Props) {
  const overdue = kind === 'due' && value !== null && value < today

  return (
    <div className={`date-field ${value ? `set-${kind}` : ''}`}>
      <span className="date-field-icon">{kind === 'due' ? <FlagIcon /> : <WeekIcon size={16} />}</span>
      <span className="date-field-text">
        <span className="date-field-label">{label}</span>
        <span className="date-field-line">
          <span className={`date-field-value ${value ? '' : 'is-empty'}`}>{value ? fieldDateLabel(value) : 'не задано'}</span>
          {kind === 'due' && value && (
            <span className={`date-field-rel ${overdue ? 'overdue' : ''}`}>{relativeLabel(value, today)}</span>
          )}
        </span>
      </span>
      {!value && (
        <span className="row-chevron">
          <ChevronIcon />
        </span>
      )}
      <NativeDateInput value={value} label={label} onChange={onChange} />
      {value && (
        <button className="date-field-clear" onClick={() => onChange(null)} aria-label={`убрать: ${label}`}>
          <CloseIcon />
        </button>
      )}
    </div>
  )
}
