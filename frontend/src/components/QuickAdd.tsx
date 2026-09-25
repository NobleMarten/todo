import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Project } from '../api/types'
import { shortDate, todayStr } from '../lib/date'
import { PRIORITY_LABEL, TITLE_MAX } from '../lib/format'
import { parseQuickAdd, suggestProjects, tagOf, typingTag, type QuickParse } from '../lib/quickAdd'
import { CalendarIcon, PlusIcon, SpinIcon, TargetIcon } from './icons'

interface Props {
  placeholder: string
  label: string
  projects: Project[] // куда можно попасть через #имя
  inline?: boolean // в потоке экрана («Неделя»), а не пристыковано к низу
  /** null — не получилось (ошибку показывает экран); hint — куда ушла задача, если не в этот вид. */
  onAdd: (p: QuickParse) => Promise<{ hint?: string } | null>
}

/**
 * Поле быстрого добавления, пристыкованное к низу экрана списка (макет B2).
 * Разбор #списка, !приоритета, дедлайна и @дня работы — lib/quickAdd; распознанное показывается чипами до отправки.
 */
export function QuickAdd({ placeholder, label, projects, inline, onAdd }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const today = todayStr()
  const parsed = parseQuickAdd(text, projects, today)
  const hasChips = Boolean(parsed.project || parsed.priority || parsed.dueDate || parsed.scheduledFor)
  // набирается #тег — под полем подсказки списков, по нажатию тег дописывается целиком
  const tag = parsed.project ? null : typingTag(text)
  const suggestions = tag === null ? [] : suggestProjects(tag, projects).slice(0, 6)

  const pickProject = (p: Project) => {
    setText((t) => t.replace(/#[^\s#]*$/, `${tagOf(p)} `))
    inputRef.current?.focus()
  }

  // подсказка «добавлено в …» живёт пару секунд
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2500)
    return () => clearTimeout(t)
  }, [hint])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!parsed.title || busy) return
    setBusy(true)
    const res = await onAdd(parsed)
    if (res) {
      setText('')
      setHint(res.hint ?? null)
    }
    setBusy(false)
  }

  return (
    <form className={`quick-add ${inline ? 'quick-add-inline' : ''}`} onSubmit={submit}>
      {suggestions.length > 0 ? (
        <div className="quick-chips" role="listbox" aria-label="списки">
          {suggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected="false"
              className="chip chip-mono quick-suggest"
              // не забираем фокус у поля — на iPhone иначе прячется клавиатура
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pickProject(p)}
            >
              <span className="dot" style={{ background: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      ) : (hasChips || hint) && (
        <div className="quick-chips" aria-live="polite">
          {hasChips ? (
            <>
              {parsed.project && (
                <span className="chip chip-mono quick-chip">
                  <span className="dot" style={{ background: parsed.project.color }} />
                  {parsed.project.name}
                </span>
              )}
              {parsed.priority && (
                <span className={`chip chip-mono quick-chip prio-${parsed.priority}`}>
                  <span className={`check check-sm prio-${parsed.priority}`} />
                  {PRIORITY_LABEL[parsed.priority]}
                </span>
              )}
              {parsed.dueDate && (
                <span className="chip chip-mono quick-chip">
                  <CalendarIcon />
                  дедлайн {shortDate(parsed.dueDate)}
                </span>
              )}
              {parsed.scheduledFor && (
                <span className="chip chip-mono quick-chip">
                  <TargetIcon />
                  делаю {parsed.scheduledFor === today ? 'сегодня' : shortDate(parsed.scheduledFor)}
                </span>
              )}
            </>
          ) : (
            <span className="quick-hint">{hint}</span>
          )}
        </div>
      )}
      <div className="quick-add-row">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          maxLength={TITLE_MAX + 40} // служебные слова вырезаются, лимит заголовка проверяем по разобранному
          enterKeyHint="done"
        />
        <button
          type="submit"
          className="quick-add-btn"
          disabled={!parsed.title || parsed.title.length > TITLE_MAX || busy}
          aria-label="добавить задачу"
        >
          {busy ? <SpinIcon /> : <PlusIcon />}
        </button>
      </div>
    </form>
  )
}
