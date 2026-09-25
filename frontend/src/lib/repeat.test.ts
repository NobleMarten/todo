import { describe, expect, it } from 'vitest'
import { formatRule, isoWeekday, matches, onOrAfter, parseRule, ruleFromWord, ruleLabel, ruleOptions } from './repeat'

describe('parseRule / formatRule', () => {
  it.each([
    ['daily', 'daily'],
    ['weekdays', 'weekdays'],
    ['weekly:4,1,4', 'weekly:1,4'],
    ['monthly:31', 'monthly:31'],
  ])('%s → %s', (s, want) => {
    expect(formatRule(parseRule(s)!)).toBe(want)
  })

  it.each(['', 'hourly', 'daily:1', 'weekly:', 'weekly:0', 'weekly:8', 'monthly:0', 'monthly:32', 'monthly:x'])(
    'плохое: %s',
    (s) => {
      expect(parseRule(s)).toBeNull()
    },
  )
})

describe('подписи', () => {
  it('ruleLabel', () => {
    expect(ruleLabel(null)).toBe('не повторяется')
    expect(ruleLabel('daily')).toBe('каждый день')
    expect(ruleLabel('weekdays')).toBe('по будням')
    expect(ruleLabel('weekly:1,4')).toBe('по пн, чт')
    expect(ruleLabel('weekly:1,2,3,4,5,6,7')).toBe('каждый день')
    expect(ruleLabel('monthly:15')).toBe('каждое 15-е')
  })

  it('ruleOptions от пятницы 25.09', () => {
    expect(ruleOptions('2026-09-25').map((o) => o.value)).toEqual(['', 'daily', 'weekdays', 'weekly:5', 'monthly:25'])
    expect(ruleOptions('2026-09-25')[3].label).toBe('каждую неделю · пт')
  })
})

describe('даты', () => {
  it('isoWeekday', () => {
    expect(isoWeekday('2026-09-21')).toBe(1)
    expect(isoWeekday('2026-09-27')).toBe(7)
  })

  it('matches / onOrAfter', () => {
    expect(onOrAfter(parseRule('weekdays')!, '2026-09-26')).toBe('2026-09-28') // сб → пн
    expect(onOrAfter(parseRule('daily')!, '2026-09-26')).toBe('2026-09-26')
    expect(onOrAfter(parseRule('weekly:3')!, '2026-09-25')).toBe('2026-09-30')
    expect(onOrAfter(parseRule('monthly:31')!, '2026-09-25')).toBe('2026-09-30') // в сентябре 30
    expect(matches(parseRule('monthly:31')!, '2027-02-28')).toBe(true)
  })

  it('ruleFromWord — от опорной даты', () => {
    expect(ruleFromWord('ежедневно', '2026-09-25')).toBe('daily')
    expect(ruleFromWord('по-будням', '2026-09-25')).toBe('weekdays')
    expect(ruleFromWord('еженедельно', '2026-09-28')).toBe('weekly:1')
    expect(ruleFromWord('ежемесячно', '2026-09-25')).toBe('monthly:25')
    expect(ruleFromWord('ежечасно', '2026-09-25')).toBeNull()
  })
})
