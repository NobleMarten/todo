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

const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** Короткая подпись даты относительно сегодня: «сегодня», «завтра», «пт», «25 сен», «25 сен 2027». */
export function dateLabel(s: DateStr, today: DateStr): string {
  const diff = daysBetween(today, s)
  if (diff === 0) return 'сегодня'
  if (diff === 1) return 'завтра'
  if (diff === -1) return 'вчера'
  const d = fromDateStr(s)
  if (diff > 1 && diff < 7) return WEEKDAYS_SHORT[d.getDay()]
  const sameYear = d.getFullYear() === fromDateStr(today).getFullYear()
  const label = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
  return label.replace('.', '').replace(' г', '')
}

/** Длинная подпись для шапок: «четверг, 24 сентября». */
export function longDateLabel(s: DateStr): string {
  return fromDateStr(s).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
}
