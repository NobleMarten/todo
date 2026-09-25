import { describe, expect, it } from 'vitest'
import { addDays, dayHeading, daysBetween, fieldDateLabel, fromDateStr, relativeLabel, shortDate, toDateStr } from './date'

// TZ = Europe/Berlin (vitest.config.js): 29.03.2026 и 25.10.2026 — переходы на летнее/зимнее время.

describe('toDateStr / fromDateStr', () => {
  it('берут локальную дату, а не UTC', () => {
    // 00:30 по Берлину — это ещё предыдущий день по UTC
    expect(toDateStr(new Date(2026, 8, 25, 0, 30))).toBe('2026-09-25')
    expect(toDateStr(new Date(2026, 8, 25, 23, 59))).toBe('2026-09-25')
  })

  it('туда и обратно без сдвига', () => {
    for (const s of ['2026-01-01', '2026-03-29', '2026-10-25', '2028-02-29', '2026-12-31']) {
      expect(toDateStr(fromDateStr(s))).toBe(s)
    }
  })

  it('fromDateStr — локальная полночь', () => {
    const d = fromDateStr('2026-10-04')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 4, 0])
  })
})

describe('addDays', () => {
  it.each([
    ['2026-09-25', 1, '2026-09-26'],
    ['2026-09-30', 1, '2026-10-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-03-28', 1, '2026-03-29'], // переход на летнее время
    ['2026-03-29', 1, '2026-03-30'],
    ['2026-10-24', 2, '2026-10-26'], // переход на зимнее время
    ['2026-09-25', 0, '2026-09-25'],
    ['2026-09-25', -6, '2026-09-19'],
  ])('%s %+d → %s', (s, n, want) => {
    expect(addDays(s, n)).toBe(want)
  })
})

describe('daysBetween', () => {
  it('целые дни через переходы времени', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
  })

  it('знак: b − a', () => {
    expect(daysBetween('2026-09-25', '2026-09-20')).toBe(-5)
    expect(daysBetween('2026-09-25', '2026-09-25')).toBe(0)
  })
})

describe('подписи', () => {
  it('shortDate — ДД.ММ', () => {
    expect(shortDate('2026-10-04')).toBe('04.10')
  })

  it('relativeLabel', () => {
    const today = '2026-09-25'
    expect(relativeLabel('2026-09-25', today)).toBe('сегодня')
    expect(relativeLabel('2026-09-26', today)).toBe('завтра')
    expect(relativeLabel('2026-10-08', today)).toBe('через 13 дн')
    expect(relativeLabel('2026-09-23', today)).toBe('просрочен на 2 дн')
  })

  it('день недели в подписях', () => {
    expect(fieldDateLabel('2026-10-04')).toBe('4 октября, вс')
    expect(dayHeading('2026-09-25')).toBe('пт · 25 сентября')
  })
})
