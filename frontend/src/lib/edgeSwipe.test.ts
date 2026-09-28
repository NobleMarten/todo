import { describe, expect, it } from 'vitest'
import { decideEdge, edgeBackEnabled, edgeProgress, shouldGoBack, startsAtEdge } from './edgeSwipe'
import { parentOf } from './nav'

describe('свайп от края', () => {
  it('начинается только у самого края', () => {
    expect(startsAtEdge(4)).toBe(true)
    expect(startsAtEdge(15)).toBe(true)
    expect(startsAtEdge(16)).toBe(false) // там уже строка списка со своим свайпом
    expect(startsAtEdge(30)).toBe(false)
  })

  it('решение: ждём, ведём вправо, отдаём прокрутке вертикаль и влево', () => {
    expect(decideEdge(3, 2)).toBe('wait')
    expect(decideEdge(20, 5)).toBe('track')
    expect(decideEdge(10, 12)).toBe('cancel')
    expect(decideEdge(-10, 0)).toBe('cancel')
  })

  it('назад после 72 px или быстрым смахом', () => {
    expect(shouldGoBack(80, 0)).toBe(true)
    expect(shouldGoBack(50, 0)).toBe(false)
    expect(shouldGoBack(30, 800)).toBe(true)
    expect(shouldGoBack(10, 800)).toBe(false)
  })

  it('прогресс для индикатора', () => {
    expect(edgeProgress(36)).toBe(0.5)
    expect(edgeProgress(200)).toBe(1)
    expect(edgeProgress(-5)).toBe(0)
  })

  it('на iOS — только в standalone', () => {
    expect(edgeBackEnabled(true, false)).toBe(false)
    expect(edgeBackEnabled(true, true)).toBe(true)
    expect(edgeBackEnabled(false, false)).toBe(true)
  })
})

describe('parentOf', () => {
  it('куда ведёт «назад»', () => {
    expect(parentOf('/lists/3')).toBe('/lists')
    expect(parentOf('/lists/inbox')).toBe('/lists')
    expect(parentOf('/search')).toBe('/lists')
    expect(parentOf('/plan')).toBe('/today')
    expect(parentOf('/today')).toBeNull()
    expect(parentOf('/lists')).toBeNull()
  })
})
