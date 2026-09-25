import { describe, expect, it } from 'vitest'
import type { Project } from '../api/types'
import { findProject, normalizeName, parseDateWord, parseQuickAdd, suggestProjects, tagOf, typingTag } from './quickAdd'

const project = (id: number, name: string): Project => ({
  id,
  name,
  color: '#6AA6FF',
  position: id,
  archived: false,
  created_at: '2026-09-24T00:00:00Z',
})

// Сиды миграции 00003 + «Учёт расходов»: у него с «Учёбой» общее начало «уч» — проверка неоднозначности.
const GO = project(1, 'Go')
const STUDY = project(2, 'Учёба')
const TODO = project(3, 'Todo')
const FIN = project(4, 'Finance-Tracker')
const INTERN = project(5, 'Стажировка')
const PERSONAL = project(6, 'Личное')
const ACCOUNTING = project(7, 'Учёт расходов')
const PROJECTS = [GO, STUDY, TODO, FIN, INTERN, PERSONAL, ACCOUNTING]

const TODAY = '2026-09-25' // пятница

describe('normalizeName', () => {
  it('регистр, ё = е, без пробелов и знаков', () => {
    expect(normalizeName('Finance-Tracker')).toBe('financetracker')
    expect(normalizeName('Учёба')).toBe('учеба')
    expect(normalizeName('  Учёт   расходов ')).toBe('учетрасходов')
    expect(normalizeName('go 2')).toBe('go2')
  })
})

describe('findProject', () => {
  it.each([
    ['todo', TODO],
    ['TODO', TODO],
    ['учеба', STUDY],
    ['Учёба', STUDY],
    ['учеба,', STUDY], // знак препинания после тега
    ['finance-tracker', FIN],
    ['financetracker', FIN],
    ['fin', FIN], // однозначное начало имени
    ['учётрасходов', ACCOUNTING],
    ['go', GO],
  ])('#%s', (tag, want) => {
    expect(findProject(tag, PROJECTS)).toBe(want)
  })

  it('точное совпадение важнее префикса', () => {
    const goLang = project(8, 'Golang')
    expect(findProject('go', [goLang, GO])).toBe(GO)
  })

  it('неоднозначный префикс, пустой или незнакомый тег — null', () => {
    expect(findProject('уч', PROJECTS)).toBeNull() // Учёба и Учёт расходов
    expect(findProject('', PROJECTS)).toBeNull()
    expect(findProject('---', PROJECTS)).toBeNull()
    expect(findProject('работа', PROJECTS)).toBeNull()
  })
})

describe('подсказки при наборе', () => {
  it('typingTag — только последнее слово, если это #тег', () => {
    expect(typingTag('докер #to')).toBe('to')
    expect(typingTag('#')).toBe('')
    expect(typingTag('докер #todo ')).toBeNull()
    expect(typingTag('a#b')).toBeNull()
    expect(typingTag('докер')).toBeNull()
  })

  it('suggestProjects — по началу имени, «#» без букв — все', () => {
    expect(suggestProjects('уч', PROJECTS)).toEqual([STUDY, ACCOUNTING])
    expect(suggestProjects('', PROJECTS)).toEqual(PROJECTS)
  })

  it('tagOf склеивает пробелы, и тег находит свой список', () => {
    expect(tagOf(ACCOUNTING)).toBe('#Учётрасходов')
    expect(findProject(tagOf(ACCOUNTING).slice(1), PROJECTS)).toBe(ACCOUNTING)
  })
})

describe('parseDateWord', () => {
  it('завтра', () => {
    expect(parseDateWord('завтра', TODAY)).toBe('2026-09-26')
    expect(parseDateWord('Завтра', TODAY)).toBe('2026-09-26')
    expect(parseDateWord('завтра', '2026-12-31')).toBe('2027-01-01')
  })

  it.each([
    ['сб', '2026-09-26'],
    ['вс', '2026-09-27'],
    ['пн', '2026-09-28'],
    ['чт', '2026-10-01'],
    ['пт', '2026-10-02'], // сегодня пятница — следующая пятница
    ['ПН', '2026-09-28'],
  ])('день недели %s → %s', (w, want) => {
    expect(parseDateWord(w, TODAY)).toBe(want)
  })

  it('ДД.ММ — ближайшая такая дата', () => {
    expect(parseDateWord('04.10', TODAY)).toBe('2026-10-04')
    expect(parseDateWord('4.10', TODAY)).toBe('2026-10-04')
    expect(parseDateWord('25.09', TODAY)).toBe('2026-09-25') // сегодня — ещё этот год
    expect(parseDateWord('24.09', TODAY)).toBe('2027-09-24') // прошла — следующий год
    expect(parseDateWord('01.01', TODAY)).toBe('2027-01-01')
  })

  it('ДД.ММ.ГГ и ДД.ММ.ГГГГ — год как есть, даже в прошлом', () => {
    expect(parseDateWord('04.10.27', TODAY)).toBe('2027-10-04')
    expect(parseDateWord('04.10.2027', TODAY)).toBe('2027-10-04')
    expect(parseDateWord('01.01.2026', TODAY)).toBe('2026-01-01')
  })

  it('29.02 без года — только если в этом году такая дата есть', () => {
    expect(parseDateWord('29.02', '2028-01-10')).toBe('2028-02-29')
    expect(parseDateWord('29.02.2028', TODAY)).toBe('2028-02-29')
  })

  it('несуществующие даты и не-даты — null', () => {
    for (const w of ['31.09', '00.10', '12.13', '32.01', '1.2.3', '04.10.202', 'сегодня', '25', 'пятница', '']) {
      expect(parseDateWord(w, TODAY), w).toBeNull()
    }
  })
})

describe('parseQuickAdd', () => {
  it('пример из спеки', () => {
    expect(parseQuickAdd('докер для todo #todo !срочно 25.09', PROJECTS, TODAY)).toEqual({
      title: 'докер для todo',
      project: TODO,
      priority: 'high',
      dueDate: '2026-09-25',
    })
  })

  it('порядок кусков не важен, регистр — тоже', () => {
    expect(parseQuickAdd('!Важно завтра #FIN отчёт', PROJECTS, TODAY)).toEqual({
      title: 'отчёт',
      project: FIN,
      priority: 'medium',
      dueDate: '2026-09-26',
    })
  })

  it('без разметки — только заголовок, лишние пробелы схлопываются', () => {
    expect(parseQuickAdd('  купить   молоко ', PROJECTS, TODAY)).toEqual({ title: 'купить молоко' })
  })

  it('нераспознанный #тег и одинокий # остаются в заголовке', () => {
    expect(parseQuickAdd('прочитать #книги #', PROJECTS, TODAY)).toEqual({ title: 'прочитать #книги #' })
    expect(parseQuickAdd('#уч конспект', PROJECTS, TODAY)).toEqual({ title: '#уч конспект' })
  })

  it('берётся первое совпадение каждого вида, повторы — в заголовок', () => {
    expect(parseQuickAdd('#go #todo !срочно !обычно пн вт задача', PROJECTS, TODAY)).toEqual({
      title: '#todo !обычно вт задача',
      project: GO,
      priority: 'high',
      dueDate: '2026-09-28',
    })
  })

  it('незнакомое !слово — часть заголовка', () => {
    expect(parseQuickAdd('!потом разобрать почту', PROJECTS, TODAY)).toEqual({ title: '!потом разобрать почту' })
  })

  it('заголовок может остаться пустым', () => {
    expect(parseQuickAdd('#todo завтра', PROJECTS, TODAY)).toEqual({ title: '', project: TODO, dueDate: '2026-09-26' })
  })
})
