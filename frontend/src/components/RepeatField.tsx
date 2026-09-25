import type { DateStr } from '../api/types'
import { formatRule, parseRule, ruleLabel, ruleOptions, WEEKDAY_SHORT } from '../lib/repeat'
import { ChevronIcon, CloseIcon, RepeatIcon } from './icons'

interface Props {
  value: string | null
  base: DateStr // от неё «каждую неделю» и «каждый месяц»: дата «делаю», дедлайна или сегодня
  onChange: (v: string | null) => void
}

/**
 * Поле «повтор» карточки — в стиле полей дат: тап открывает системный список (на iPhone — колесо).
 * У «по дням недели» ниже переключатели пн…вс. Выполнишь повторяющуюся — сервер создаст следующую.
 */
export function RepeatField({ value, base, onChange }: Props) {
  const rule = parseRule(value)
  const options = ruleOptions(base)
  // своё правило (например, «по пн, чт») — отдельным пунктом, чтобы select его показывал
  if (value && !options.some((o) => o.value === value)) options.splice(1, 0, { value, label: ruleLabel(value) })

  const toggleDay = (d: number) => {
    if (rule?.kind !== 'weekly') return
    const days = rule.days.includes(d) ? rule.days.filter((x) => x !== d) : [...rule.days, d].sort((a, b) => a - b)
    if (days.length > 0) onChange(formatRule({ kind: 'weekly', days }))
  }

  return (
    <div className="repeat-field">
      <div className={`date-field ${rule ? 'set-repeat' : ''}`}>
        <span className="date-field-icon">
          <RepeatIcon size={17} />
        </span>
        <span className="date-field-text">
          <span className="date-field-label">повтор — снова после выполнения</span>
          <span className={`date-field-value ${rule ? '' : 'is-empty'}`}>{ruleLabel(value)}</span>
        </span>
        {!rule && (
          <span className="row-chevron">
            <ChevronIcon />
          </span>
        )}
        <select
          className="date-native"
          value={value ?? ''}
          aria-label="повтор"
          onChange={(e) => onChange(e.target.value || null)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {rule && (
          <button className="date-field-clear" onClick={() => onChange(null)} aria-label="убрать повтор">
            <CloseIcon />
          </button>
        )}
      </div>
      {rule?.kind === 'weekly' && (
        <div className="repeat-days" role="group" aria-label="дни недели">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              className={`chip chip-mono ${rule.days.includes(d) ? 'active' : ''}`}
              aria-pressed={rule.days.includes(d)}
              onClick={() => toggleDay(d)}
            >
              {WEEKDAY_SHORT[d]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
