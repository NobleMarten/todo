import type { DateStr } from '../api/types'

// Все календарные вычисления — по локальной дате устройства и строками "YYYY-MM-DD":
// через Date() с UTC-разбором легко потерять день, поэтому парсим руками.

/** Локальная календарная дата Date → "YYYY-MM-DD". */
export function toDateStr(d: Date): DateStr {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** "YYYY-MM-DD" → локальная полночь. */
export function fromDateStr(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayStr(): DateStr {
  return toDateStr(new Date())
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = fromDateStr(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/** Разница в днях b − a (обе даты локальные, переходы на летнее время не мешают). */
export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((fromDateStr(b).getTime() - fromDateStr(a).getTime()) / 86_400_000)
}

/** Понедельник недели, в которую попадает дата. */
export function mondayOf(s: DateStr): DateStr {
  return addDays(s, -((fromDateStr(s).getDay() + 6) % 7))
}

const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

/** «Понедельник, 21 сентября» — заголовок дня на «Неделе». */
export function longDayLabel(s: DateStr): string {
  const d = fromDateStr(s)
  const w = WEEKDAYS_FULL[d.getDay()]
  return `${w[0].toUpperCase()}${w.slice(1)}, ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
}

/** Месяц(ы) недели: «Сентябрь» или «Сентябрь – октябрь», с годом, если он не текущий. */
export function weekTitle(from: DateStr, to: DateStr, today: DateStr): string {
  const a = fromDateStr(from)
  const b = fromDateStr(to)
  const cap = (m: string) => `${m[0].toUpperCase()}${m.slice(1)}`
  let title = a.getMonth() === b.getMonth() ? cap(MONTHS[a.getMonth()]) : `${cap(MONTHS[a.getMonth()])} – ${MONTHS[b.getMonth()]}`
  if (b.getFullYear() !== fromDateStr(today).getFullYear()) title += ` ${b.getFullYear()}`
  return title
}

/** Число дня месяца: «21». */
export function dayOfMonth(s: DateStr): number {
  return fromDateStr(s).getDate()
}

/** Короткий день недели: «пн». */
export function weekdayShort(s: DateStr): string {
  return WEEKDAYS_SHORT[fromDateStr(s).getDay()]
}

const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** Короткая дата для бейджей: «17.09». */
export function shortDate(s: DateStr): string {
  const [, m, d] = s.split('-')
  return `${d}.${m}`
}

/** Дата для поля карточки: «4 октября, сб». */
export function fieldDateLabel(s: DateStr): string {
  const d = fromDateStr(s)
  const day = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return `${day}, ${WEEKDAYS_SHORT[d.getDay()]}`
}

/** Сколько осталось до даты: «через 13 дн», «сегодня», «завтра», «просрочен на 2 дн». */
export function relativeLabel(s: DateStr, today: DateStr): string {
  const diff = daysBetween(today, s)
  if (diff === 0) return 'сегодня'
  if (diff === 1) return 'завтра'
  if (diff > 1) return `через ${diff} дн`
  return `просрочен на ${-diff} дн`
}

/** Дата в шапке «Сегодня»: «ср · 24 сентября». */
export function dayHeading(s: DateStr): string {
  const d = fromDateStr(s)
  return `${WEEKDAYS_SHORT[d.getDay()]} · ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
}

/** Время выполнения по локальным часам: «14:05». */
export function timeOf(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
