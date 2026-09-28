import { describe, expect, it } from 'vitest'
import { createScrollMemory } from './scrollMemory'

describe('createScrollMemory', () => {
  it('«назад» возвращает прокрутку этой записи истории', () => {
    const m = createScrollMemory()
    m.save('k1', '/lists/1', 600)
    m.save('k2', '/lists', 0)
    expect(m.target('POP', 'k1', '/lists/1')).toBe(600)
  })

  it('незнакомая запись при «назад» (перезагрузка) — сверху', () => {
    expect(createScrollMemory().target('POP', 'x', '/today')).toBe(0)
  })

  it('вкладка помнит свою прокрутку при переходе из таб-бара', () => {
    const m = createScrollMemory()
    m.save('a', '/today', 231)
    m.save('b', '/week', 40)
    expect(m.target('PUSH', 'c', '/today')).toBe(231)
    expect(m.target('PUSH', 'd', '/archive')).toBe(0)
  })

  it('вперёд на экран не из вкладок — наверх, даже если он уже был прокручен', () => {
    const m = createScrollMemory()
    m.save('a', '/lists/1', 600)
    expect(m.target('PUSH', 'b', '/lists/1')).toBe(0)
  })

  it('replace не трогает прокрутку', () => {
    expect(createScrollMemory().target('REPLACE', 'a', '/week')).toBeNull()
  })
})
