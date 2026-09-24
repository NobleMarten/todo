import type { DateStr, Priority, Project } from '../api/types'
import { addDays, fromDateStr, toDateStr } from './date'

// Быстрый ввод: «докер для todo #todo !срочно 25.09» → заголовок + список + приоритет + дедлайн.
// Распознаются только отдельные слова; каждого вида берётся первое совпадение,
// повторы и нераспознанные #теги остаются частью заголовка.

export interface QuickParse {
  title: string
  project?: Project
  priority?: Priority
  dueDate?: DateStr
}

const PRIORITY_WORDS: Record<string, Priority> = {
  '!срочно': 'high',
  '!важно': 'medium',
  '!обычно': 'low',
}

// индекс = Date.getDay()
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

const DATE_RE = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?$/

/** Имя для сравнения: без регистра, ё = е, без пробелов, дефисов и прочих знаков. */
export function normalizeName(name: string): string {
  return name.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * Список по тегу (без «#»): точное совпадение имени, иначе единственный список, чьё имя
 * начинается с тега («#fin» → Finance-Tracker). Неоднозначный или пустой тег — null.
 */
export function findProject(tag: string, projects: Project[]): Project | null {
  const t = normalizeName(tag)
  if (!t) return null
  const exact = projects.find((p) => normalizeName(p.name) === t)
  if (exact) return exact
  const byPrefix = projects.filter((p) => normalizeName(p.name).startsWith(t))
  return byPrefix.length === 1 ? byPrefix[0] : null
}

/** Слово, которое сейчас набирается, если это #тег: для подсказок списков под полем. */
export function typingTag(input: string): string | null {
  const m = /(?:^|\s)#([^\s#]*)$/.exec(input)
  return m ? m[1] : null
}

/** Подсказки к набираемому #тегу: списки, чьё имя начинается с него (или все, если набран один «#»). */
export function suggestProjects(tag: string, projects: Project[]): Project[] {
  const t = normalizeName(tag)
  return projects.filter((p) => normalizeName(p.name).startsWith(t))
}

/** Тег для подстановки в поле: имя без пробелов, чтобы оно осталось одним словом. */
export function tagOf(p: Project): string {
  return `#${p.name.replace(/\s+/g, '')}`
}

/**
 * «25.09» / «25.09.2027» / «завтра» / «пн» → дата. ДД.ММ без года — ближайшая такая дата:
 * если в этом году она уже прошла, берётся следующий год. День недели — ближайший после сегодня
 * («пн» в понедельник — следующий понедельник).
 */
export function parseDateWord(word: string, today: DateStr): DateStr | null {
  const w = word.toLocaleLowerCase('ru')
  if (w === 'завтра') return addDays(today, 1)

  const dow = WEEKDAYS.indexOf(w)
  if (dow !== -1) {
    const diff = (dow - fromDateStr(today).getDay() + 7) % 7
    return addDays(today, diff === 0 ? 7 : diff)
  }

  const m = DATE_RE.exec(w)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  let year = m[3] ? Number(m[3]) : fromDateStr(today).getFullYear()
  if (m[3] && m[3].length === 2) year += 2000

  const valid = (y: number) => {
    const d = new Date(y, month - 1, day)
    return d.getFullYear() === y && d.getMonth() === month - 1 && d.getDate() === day ? toDateStr(d) : null
  }
  const date = valid(year)
  if (!date) return null
  if (!m[3] && date < today) return valid(year + 1)
  return date
}

export function parseQuickAdd(input: string, projects: Project[], today: DateStr): QuickParse {
  const out: QuickParse = { title: '' }
  const rest: string[] = []

  for (const word of input.trim().split(/\s+/)) {
    if (!word) continue
    const lower = word.toLocaleLowerCase('ru')

    if (!out.project && lower.length > 1 && lower.startsWith('#')) {
      const p = findProject(lower.slice(1), projects)
      if (p) {
        out.project = p
        continue
      }
    }
    if (!out.priority && PRIORITY_WORDS[lower]) {
      out.priority = PRIORITY_WORDS[lower]
      continue
    }
    if (!out.dueDate) {
      const d = parseDateWord(word, today)
      if (d) {
        out.dueDate = d
        continue
      }
    }
    rest.push(word)
  }

  out.title = rest.join(' ')
  return out
}
