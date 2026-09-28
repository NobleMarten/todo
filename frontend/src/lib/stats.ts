import type { DateStr, StatsDay, StatsTotals } from '../api/types'
import { addDays, dayOfMonth, daysBetween, fromDateStr, shortDate, toDateStr, weekdayShort } from './date'
import { plural } from './format'

// ── периоды экрана «Итоги» ────────────────────────────────────────────────────

export type Period = 'week' | 'month' | 'year'

export const PERIODS: { key: Period; label: string; days: number; vs: string }[] = [
  { key: 'week', label: '7 дней', days: 7, vs: 'к прошлым 7 дням' },
  { key: 'month', label: '30 дней', days: 30, vs: 'к прошлым 30 дням' },
  { key: 'year', label: 'год', days: 365, vs: 'к прошлому году' },
]

export function periodOf(key: Period) {
  return PERIODS.find((p) => p.key === key) ?? PERIODS[1]
}

const PERIOD_KEY = 'stats-period'

/** Выбранный период переживает перезапуск; хранилище может быть недоступно — тогда 30 дней. */
export function loadPeriod(): Period {
  try {
    const v = localStorage.getItem(PERIOD_KEY)
    return PERIODS.some((p) => p.key === v) ? (v as Period) : 'month'
  } catch {
    return 'month'
  }
}

export function savePeriod(p: Period): void {
  try {
    localStorage.setItem(PERIOD_KEY, p)
  } catch {
    // приватный режим или запрет хранилища — просто не запоминаем
  }
}

/** Период, заканчивающийся сегодня (включительно). */
export function periodRange(key: Period, today: DateStr): { from: DateStr; to: DateStr } {
  return { from: addDays(today, -(periodOf(key).days - 1)), to: today }
}

// ── столбики графика «выполнено и создано» ────────────────────────────────────

export interface Bucket {
  from: DateStr
  to: DateStr
  done: number
  created: number
  label: string // подпись под осью; '' — без подписи
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/**
 * Дни периода → столбики: 7 и 30 дней — по дню, год — по неделям. Недели режутся от последнего дня,
 * чтобы последний столбик кончался сегодня; неполная неделя, если есть, — самая первая.
 */
export function bucketize(days: StatsDay[], period: Period): Bucket[] {
  if (period !== 'year') {
    const last = days.length - 1
    return days.map((d, i) => ({
      from: d.date,
      to: d.date,
      done: d.done,
      created: d.created,
      // на 30 днях — каждый седьмой день от сегодняшнего, иначе числа слипаются
      label: period === 'week' ? weekdayShort(d.date) : (last - i) % 7 === 0 ? String(dayOfMonth(d.date)) : '',
    }))
  }
  const out: Bucket[] = []
  for (let end = days.length; end > 0; end -= 7) {
    const chunk = days.slice(Math.max(0, end - 7), end)
    out.unshift({
      from: chunk[0].date,
      to: chunk[chunk.length - 1].date,
      done: chunk.reduce((n, d) => n + d.done, 0),
      created: chunk.reduce((n, d) => n + d.created, 0),
      label: '',
    })
  }
  // подпись месяца — у первой недели, которая в нём начинается
  let prev = -1
  for (const b of out) {
    const m = fromDateStr(b.from).getMonth()
    if (m !== prev && prev !== -1) b.label = MONTHS_SHORT[m]
    prev = m
  }
  return out
}

/** Подпись столбика в подсказке: «пн, 21.09» или «15.09 – 21.09». */
export function bucketTitle(b: Bucket): string {
  return b.from === b.to ? `${weekdayShort(b.from)}, ${shortDate(b.from)}` : `${shortDate(b.from)} – ${shortDate(b.to)}`
}

// ── геометрия графиков ────────────────────────────────────────────────────────

/**
 * Плавная линия через точки: монотонный кубический сплайн (Фриша — Карлсона). В отличие от обычного
 * сглаживания не выгибается ниже нуля и выше пиков — график не рисует того, чего не было.
 */
export function monotonePath(pts: [number, number][]): string {
  const n = pts.length
  if (n === 0) return ''
  const f = (v: number) => Number(v.toFixed(2))
  if (n === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    slope.push((pts[i + 1][1] - pts[i][1]) / dx[i])
  }
  // касательные: на краях — наклон отрезка, внутри — гармоническое среднее, на экстремумах — 0
  const m = pts.map((_, i) => {
    if (i === 0) return slope[0]
    if (i === n - 1) return slope[n - 2]
    const a = slope[i - 1]
    const b = slope[i]
    if (a * b <= 0) return 0
    const w1 = 2 * dx[i] + dx[i - 1]
    const w2 = dx[i] + 2 * dx[i - 1]
    return (w1 + w2) / (w1 / a + w2 / b)
  })
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const h = dx[i] / 3
    d += `C${f(x0 + h)},${f(y0 + m[i] * h)} ${f(x1 - h)},${f(y1 - m[i + 1] * h)} ${f(x1)},${f(y1)}`
  }
  return d
}

/** Шкала оси: 0, середина (если круглая) и верх. */
export function axisTicks(max: number): number[] {
  return max >= 2 && max % 2 === 0 ? [0, max / 2, max] : [0, max]
}

/** Среднее в день с одной цифрой после запятой: «1,4». */
export function perDay(total: number, days: number): string {
  if (days <= 0) return '0'
  return (Math.round((total / days) * 10) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}

// ── числа ─────────────────────────────────────────────────────────────────────

// шаги шкалы выше 5: чётные (середина оси — целое) и частые, чтобы над пиком не оставалось полграфика пустоты
const NICE_STEPS = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]

/** Верх шкалы: ближайшее «круглое» число не меньше n (…, 10, 12, 16, 20, 24, 30…), но не меньше 1. */
export function niceMax(n: number): number {
  if (n <= 5) return Math.max(1, Math.ceil(n))
  const pow = 10 ** Math.floor(Math.log10(n))
  for (const step of NICE_STEPS) {
    const v = Math.round(step * pow)
    if (n <= v) return v
  }
  return 10 * pow
}

/** Доля в процентах, округлённая; null — если делить не на что. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

/** Изменение к прошлому периоду со знаком: «+3», «−2», «0». */
export function signed(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${-n}`
  return '0'
}

/** Медиана «создана → выполнена»: «< 1 ч», «20 ч», «3 дн». */
export function formatLead(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return '< 1 ч'
  if (hours < 48) return `${Math.round(hours)} ч`
  return `${Math.round(hours / 24)} дн`
}

/** «5 дней». */
export function pluralDays(n: number): string {
  return `${n} ${plural(n, ['день', 'дня', 'дней'])}`
}

/** Индекс самого большого значения (первый из равных); -1 — все нули. */
export function peakIndex(values: number[]): number {
  let best = -1
  values.forEach((v, i) => {
    if (v > 0 && (best < 0 || v > values[best])) best = i
  })
  return best
}

/** Доля выполненных в срок среди выполненных с дедлайном. */
export function onTimeRate(t: StatsTotals): number | null {
  return percent(t.on_time, t.on_time + t.late)
}

// ── задача в карточке ─────────────────────────────────────────────────────────

/**
 * Строки сводки по задаче: сколько живёт или за сколько сделана, в срок ли, сколько раз переносили.
 * Дни — локальные календарные, как и всё в lib/date.
 */
export function taskFacts(
  t: { created_at: string; done_at: string | null; due_date: DateStr | null; postponed: number },
  today: DateStr,
): string[] {
  const created = localDate(t.created_at)
  const facts: string[] = []
  if (t.done_at) {
    const done = localDate(t.done_at)
    const took = dayDiff(created, done)
    facts.push(took === 0 ? 'сделана в день создания' : `сделана за ${pluralDays(took)}`)
    if (t.due_date) {
      const late = dayDiff(t.due_date, done)
      facts.push(late > 0 ? `позже срока на ${pluralDays(late)}` : 'в срок')
    }
  } else {
    const age = dayDiff(created, today)
    facts.push(age === 0 ? 'создана сегодня' : `создана ${pluralDays(age)} назад`)
  }
  if (t.postponed > 0) facts.push(`переносили ${t.postponed} ${plural(t.postponed, ['раз', 'раза', 'раз'])}`)
  return facts
}

function localDate(iso: string): DateStr {
  return toDateStr(new Date(iso))
}

function dayDiff(a: DateStr, b: DateStr): number {
  return Math.max(0, daysBetween(a, b))
}
