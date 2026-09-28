import { describe, expect, it } from 'vitest'
import type { StatsDay } from '../api/types'
import { addDays } from './date'
import { bucketTitle, bucketize, formatLead, niceMax, peakIndex, periodRange, signed, taskFacts } from './stats'

function daysFrom(from: string, n: number): StatsDay[] {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), done: 1, created: i % 2 }))
}

describe('periodRange', () => {
  it('ends today inclusive', () => {
    expect(periodRange('week', '2026-09-28')).toEqual({ from: '2026-09-22', to: '2026-09-28' })
    expect(periodRange('month', '2026-09-28').from).toBe('2026-08-30')
    expect(periodRange('year', '2026-09-28').from).toBe('2025-09-29')
  })
})

describe('bucketize', () => {
  it('one bucket per day with weekday labels for a week', () => {
    const b = bucketize(daysFrom('2026-09-22', 7), 'week')
    expect(b).toHaveLength(7)
    expect(b.map((x) => x.label)).toEqual(['вт', 'ср', 'чт', 'пт', 'сб', 'вс', 'пн'])
  })

  it('labels every seventh day back from today for 30 days', () => {
    const b = bucketize(daysFrom('2026-08-30', 30), 'month')
    expect(b[29].label).toBe('28')
    expect(b[22].label).toBe('21')
    expect(b[28].label).toBe('')
    expect(b[0].label).toBe('')
  })

  it('groups a year into weeks ending today, partial week first', () => {
    const b = bucketize(daysFrom('2025-09-29', 365), 'year')
    expect(b).toHaveLength(53)
    expect(b[0].from).toBe('2025-09-29')
    expect(b[0].to).toBe('2025-09-29') // 365 = 52·7 + 1
    expect(b[52]).toMatchObject({ from: '2026-09-22', to: '2026-09-28', done: 7, created: 3 })
    expect(b.reduce((n, x) => n + x.done, 0)).toBe(365)
    // месяц подписан на первой неделе, что в нём начинается; первая неделя без подписи
    expect(b[0].label).toBe('')
    expect(b.filter((x) => x.label).length).toBe(12)
    expect(bucketTitle(b[52])).toBe('22.09 – 28.09')
  })
})

describe('numbers', () => {
  it('niceMax rounds up to 1-2-5 steps', () => {
    expect([0, 1, 3, 5, 6, 11, 21, 50, 51, 130].map(niceMax)).toEqual([1, 1, 3, 5, 10, 20, 50, 50, 100, 200])
  })

  it('signed uses a real minus', () => {
    expect([3, 0, -2].map(signed)).toEqual(['+3', '0', '−2'])
  })

  it('formatLead picks hours or days', () => {
    expect([null, 0.4, 20.4, 47, 50, 100].map(formatLead)).toEqual(['—', '< 1 ч', '20 ч', '47 ч', '2 дн', '4 дн'])
  })

  it('peakIndex ignores all-zero', () => {
    expect(peakIndex([0, 0])).toBe(-1)
    expect(peakIndex([1, 3, 3, 0])).toBe(1)
  })
})

describe('taskFacts', () => {
  const base = { created_at: '2026-09-20T10:00:00', done_at: null, due_date: null, postponed: 0 }

  it('active task shows its age', () => {
    expect(taskFacts(base, '2026-09-20')).toEqual(['создана сегодня'])
    expect(taskFacts({ ...base, postponed: 2 }, '2026-09-25')).toEqual(['создана 5 дней назад', 'переносили 2 раза'])
  })

  it('done task shows lead time and deadline', () => {
    expect(taskFacts({ ...base, done_at: '2026-09-20T23:00:00', due_date: '2026-09-21' }, '2026-09-28')).toEqual([
      'сделана в день создания',
      'в срок',
    ])
    expect(taskFacts({ ...base, done_at: '2026-09-23T09:00:00', due_date: '2026-09-21' }, '2026-09-28')).toEqual([
      'сделана за 3 дня',
      'позже срока на 2 дня',
    ])
  })
})
