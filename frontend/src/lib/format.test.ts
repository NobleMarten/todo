import { describe, expect, it } from 'vitest'
import type { Task } from '../api/types'
import { dateSectionOf, groupTasks, plural, pluralTasks } from './format'

const TODAY = '2026-09-25'

let nextId = 1
const task = (over: Partial<Task> = {}): Task => ({
  id: nextId++,
  title: 't',
  done: false,
  priority: 'low',
  project_id: null,
  parent_id: null,
  due_date: null,
  scheduled_for: null,
  position: 0,
  note: null,
  created_at: '2026-09-01T00:00:00Z',
  done_at: null,
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
})

describe('plural', () => {
  it.each([
    [0, '0 задач'],
    [1, '1 задача'],
    [2, '2 задачи'],
    [4, '4 задачи'],
    [5, '5 задач'],
    [11, '11 задач'],
    [12, '12 задач'],
    [14, '14 задач'],
    [21, '21 задача'],
    [22, '22 задачи'],
    [101, '101 задача'],
    [111, '111 задач'],
    [112, '112 задач'],
  ])('%i', (n, want) => {
    expect(pluralTasks(n)).toBe(want)
  })

  it('любые формы', () => {
    expect(plural(3, ['день', 'дня', 'дней'])).toBe('дня')
  })
})

describe('dateSectionOf', () => {
  it.each<[string, Partial<Task>, string]>([
    ['без дат', {}, 'none'],
    ['дедлайн вчера', { due_date: '2026-09-24' }, 'overdue'],
    ['просроченный дедлайн важнее «делаю сегодня»', { due_date: '2026-09-20', scheduled_for: TODAY }, 'overdue'],
    ['дедлайн сегодня', { due_date: TODAY }, 'today'],
    ['делаю сегодня', { scheduled_for: TODAY }, 'today'],
    ['делаю вчера (не доделал) — сегодня', { scheduled_for: '2026-09-20' }, 'today'],
    ['дедлайн через 7 дней — на этой неделе', { due_date: '2026-10-02' }, 'week'],
    ['дедлайн через 8 дней — позже', { due_date: '2026-10-03' }, 'later'],
    ['ближайшая из двух дат', { due_date: '2026-11-01', scheduled_for: '2026-09-27' }, 'week'],
    ['ближайшая из двух дат — дедлайн', { due_date: '2026-09-26', scheduled_for: '2026-11-01' }, 'week'],
    ['делаю в прошлом + дедлайн позже — сегодня', { due_date: '2026-11-01', scheduled_for: '2026-09-01' }, 'today'],
  ])('%s', (_, over, want) => {
    expect(dateSectionOf(task(over), TODAY)).toBe(want)
  })
})

describe('groupTasks', () => {
  it('по датам: все секции есть, внутри — приоритет, при равном — исходный порядок', () => {
    const a = task({ priority: 'low', due_date: TODAY })
    const b = task({ priority: 'high', scheduled_for: TODAY })
    const c = task({ priority: 'low', scheduled_for: TODAY })
    const d = task({ priority: 'medium' })
    const e = task({ priority: 'high', due_date: '2026-09-01' })
    const g = groupTasks([a, b, c, d, e], 'date', TODAY)

    expect([...g.keys()]).toEqual(['overdue', 'today', 'week', 'later', 'none'])
    expect(g.get('today')).toEqual([b, a, c])
    expect(g.get('overdue')).toEqual([e])
    expect(g.get('none')).toEqual([d])
    expect(g.get('week')).toEqual([])
  })

  it('по приоритету: секции по приоритету, внутри — ручной порядок', () => {
    const a = task({ priority: 'low', due_date: TODAY })
    const b = task({ priority: 'high', due_date: '2026-12-01' })
    const c = task({ priority: 'high', due_date: '2026-09-01' })
    const g = groupTasks([a, b, c], 'priority', TODAY)

    expect([...g.keys()]).toEqual(['high', 'medium', 'low'])
    expect(g.get('high')).toEqual([b, c])
    expect(g.get('low')).toEqual([a])
  })

  it('не мутирует входной массив', () => {
    const list = [task({ priority: 'low' }), task({ priority: 'high' })]
    const copy = [...list]
    groupTasks(list, 'date', TODAY)
    expect(list).toEqual(copy)
  })
})
