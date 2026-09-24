import type { DateStr, Priority, Task } from '../api/types'
import { addDays, toDateStr } from './date'

/** Local calendar date as YYYY-MM-DD for a given Date. */
export function dateKey(d: Date): string {
  return toDateStr(d)
}

/** Русское склонение: plural(5, ['задача', 'задачи', 'задач']) → «задач». */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1]
  return forms[2]
}

/** Russian plural for "задача": 1 задача, 2 задачи, 5 задач. */
export function pluralTasks(n: number): string {
  return `${n} ${plural(n, ['задача', 'задачи', 'задач'])}`
}

// ── приоритет: только цвет чекбокса и порядок внутри секции ────────────────────

export const PRIORITIES: Priority[] = ['high', 'medium', 'low']

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'срочно',
  medium: 'важно',
  low: 'обычно',
}

export const PRIORITY_WEIGHT: Record<Priority, number> = { high: 1, medium: 2, low: 3 }

// ── цвета списков ─────────────────────────────────────────────────────────────

export const PROJECT_COLORS = ['#6AA6FF', '#F5B851', '#7DE0D1', '#4ADE80', '#C08BFF', '#6E6E85', '#FF8B7D']

// ── секции экрана списка ──────────────────────────────────────────────────────

export type Grouping = 'date' | 'priority'

export type DateSection = 'overdue' | 'today' | 'week' | 'later' | 'none'
export type SectionKey = DateSection | Priority

export const DATE_SECTIONS: { key: DateSection; label: string }[] = [
  { key: 'overdue', label: 'просрочено' },
  { key: 'today', label: 'сегодня' },
  { key: 'week', label: 'на этой неделе' },
  { key: 'later', label: 'позже' },
  { key: 'none', label: 'без даты' },
]

export const PRIORITY_SECTIONS: { key: Priority; label: string }[] = PRIORITIES.map((p) => ({
  key: p,
  label: PRIORITY_LABEL[p],
}))

/**
 * Секция задачи при группировке по датам. Просроченный дедлайн важнее всего;
 * иначе решает ближайшая из двух дат, а «делаю» в прошлом (вчера не доделал) считается сегодняшней.
 */
export function dateSectionOf(t: Task, today: DateStr): DateSection {
  if (t.due_date && t.due_date < today) return 'overdue'
  const scheduled = t.scheduled_for && t.scheduled_for < today ? today : t.scheduled_for
  const dates = [scheduled, t.due_date].filter((d): d is DateStr => Boolean(d))
  if (dates.length === 0) return 'none'
  const nearest = dates.sort()[0]
  if (nearest === today) return 'today'
  if (nearest <= addDays(today, 7)) return 'week'
  return 'later'
}

export function sectionOf(t: Task, grouping: Grouping, today: DateStr): SectionKey {
  return grouping === 'date' ? dateSectionOf(t, today) : t.priority
}

export function sectionsFor(grouping: Grouping): { key: SectionKey; label: string }[] {
  return grouping === 'date' ? DATE_SECTIONS : PRIORITY_SECTIONS
}

/**
 * Раскладывает задачи (уже в порядке position) по секциям.
 * Внутри секции по датам — сначала приоритет, затем ручной порядок; по приоритету — только ручной.
 */
export function groupTasks(tasks: Task[], grouping: Grouping, today: DateStr): Map<SectionKey, Task[]> {
  const groups = new Map<SectionKey, Task[]>()
  for (const s of sectionsFor(grouping)) groups.set(s.key, [])
  for (const t of tasks) groups.get(sectionOf(t, grouping, today))!.push(t)
  if (grouping === 'date') {
    for (const [k, list] of groups) {
      groups.set(k, [...list].sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]))
    }
  }
  return groups
}

// Лимиты бэкенда (service.maxTitleLen и имя списка) — чтобы не ловить 400 на вводе.
export const TITLE_MAX = 120
export const PROJECT_NAME_MAX = 60
