import type { DateStr } from '../api/types'
import { addDays, fromDateStr } from './date'

// Правило повтора — та же строка, что в model.Repeat на бэкенде:
// daily | weekdays | weekly:1,4 (1 = пн … 7 = вс) | monthly:15 (короткий месяц — последнее число).
// Следующую копию создаёт сервер, когда повторяющуюся задачу выполняют; здесь — подписи и выбор дня.

export type Rule =
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekly'; days: number[] }
  | { kind: 'monthly'; day: number }

export function parseRule(s: string | null | undefined): Rule | null {
  if (!s) return null
  const [kind, arg] = s.split(':')
  if (kind === 'daily' || kind === 'weekdays') return arg === undefined ? { kind } : null
  if (kind === 'weekly' && arg) {
    const days = [...new Set(arg.split(',').map(Number))].sort((a, b) => a - b)
    return days.length && days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ? { kind, days } : null
  }
  if (kind === 'monthly' && arg) {
    const day = Number(arg)
    return Number.isInteger(day) && day >= 1 && day <= 31 ? { kind, day } : null
  }
  return null
}

export function formatRule(r: Rule): string {
  switch (r.kind) {
    case 'weekly':
      return `weekly:${r.days.join(',')}`
    case 'monthly':
      return `monthly:${r.day}`
    default:
      return r.kind
  }
}

/** 1 = пн … 7 = вс. */
export function isoWeekday(s: DateStr): number {
  return ((fromDateStr(s).getDay() + 6) % 7) + 1
}

const WD = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/** «каждый день», «по будням», «по пн, чт», «каждое 15-е». */
export function ruleLabel(s: string | null | undefined): string {
  const r = parseRule(s)
  if (!r) return 'не повторяется'
  switch (r.kind) {
    case 'daily':
      return 'каждый день'
    case 'weekdays':
      return 'по будням'
    case 'weekly':
      return r.days.length === 7 ? 'каждый день' : `по ${r.days.map((d) => WD[d]).join(', ')}`
    case 'monthly':
      return `каждое ${r.day}-е`
  }
}

export function matches(r: Rule, s: DateStr): boolean {
  switch (r.kind) {
    case 'daily':
      return true
    case 'weekdays':
      return isoWeekday(s) <= 5
    case 'weekly':
      return r.days.includes(isoWeekday(s))
    case 'monthly': {
      const d = fromDateStr(s)
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      return d.getDate() === Math.min(r.day, last)
    }
  }
}

/** Первая подходящая дата не раньше s. */
export function onOrAfter(r: Rule, s: DateStr): DateStr {
  for (let i = 0; i <= 400; i++) {
    const d = addDays(s, i)
    if (matches(r, d)) return d
  }
  return s
}

/** Варианты для поля «повтор» в карточке от опорной даты: еженедельно — в её день недели, ежемесячно — в её число. */
export function ruleOptions(base: DateStr): { value: string; label: string }[] {
  const weekly = `weekly:${isoWeekday(base)}`
  const monthly = `monthly:${fromDateStr(base).getDate()}`
  return [
    { value: '', label: 'не повторяется' },
    { value: 'daily', label: ruleLabel('daily') },
    { value: 'weekdays', label: ruleLabel('weekdays') },
    { value: weekly, label: `каждую неделю · ${ruleLabel(weekly).replace('по ', '')}` },
    { value: monthly, label: ruleLabel(monthly) },
  ]
}

/** Слова быстрого ввода → правило от опорной даты (как у «каждую неделю» в карточке). */
export function ruleFromWord(word: string, base: DateStr): string | null {
  switch (word) {
    case 'ежедневно':
      return 'daily'
    case 'по-будням':
    case 'побудням':
      return 'weekdays'
    case 'еженедельно':
      return `weekly:${isoWeekday(base)}`
    case 'ежемесячно':
      return `monthly:${fromDateStr(base).getDate()}`
  }
  return null
}

export const WEEKDAY_SHORT = WD
