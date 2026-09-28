import { describe, expect, it } from 'vitest'
import { blocksScroll, decide, shouldDismiss, velocity } from './sheetGesture'

describe('decide', () => {
  it('ждёт, пока палец не сдвинулся', () => {
    expect(decide(3, 4, true, false)).toBe('wait')
  })
  it('тело шита у верха, палец вниз — тянем шит', () => {
    expect(decide(1, 10, true, false)).toBe('drag')
  })
  it('тело прокручено — это прокрутка', () => {
    expect(decide(0, 10, false, false)).toBe('ignore')
  })
  it('от шапки тянем и при прокрученном теле', () => {
    expect(decide(0, 10, false, true)).toBe('drag')
  })
  it('вверх и вбок — не наш жест', () => {
    expect(decide(0, -10, true, true)).toBe('ignore')
    expect(decide(12, 8, true, true)).toBe('ignore')
  })
})

describe('blocksScroll', () => {
  it('гасит прокрутку вниз у верха ещё до SLOP', () => {
    expect(blocksScroll(0, 2, true, false)).toBe(true)
  })
  it('не мешает прокрутке вверх и прокрученному телу', () => {
    expect(blocksScroll(0, -2, true, false)).toBe(false)
    expect(blocksScroll(0, 5, false, false)).toBe(false)
  })
})

describe('shouldDismiss', () => {
  it('закрывает после 120 px', () => {
    expect(shouldDismiss(150, 0)).toBe(true)
    expect(shouldDismiss(50, 0)).toBe(false)
  })
  it('быстрый смах закрывает и с малым сдвигом', () => {
    expect(shouldDismiss(40, 900)).toBe(true)
    expect(shouldDismiss(40, -900)).toBe(false)
    expect(shouldDismiss(0, 900)).toBe(false)
  })
})

describe('velocity', () => {
  it('px/с по последним 100 мс', () => {
    const s = [
      { t: 0, y: 0 },
      { t: 200, y: 10 },
      { t: 250, y: 40 },
      { t: 300, y: 70 },
    ]
    expect(velocity(s)).toBeCloseTo(600)
  })
  it('одна точка — ноль', () => {
    expect(velocity([{ t: 0, y: 5 }])).toBe(0)
  })
})
