import { describe, expect, it } from 'vitest'
import { PULL_AT, PULL_MAX, decidePull, pullDistance, pullProgress, shouldRefresh } from './pullRefresh'

describe('pullRefresh', () => {
  it('waits inside the slop, tracks a downward pull, cancels sideways and upward', () => {
    expect(decidePull(3, 5)).toBe('wait')
    expect(decidePull(2, 20)).toBe('track')
    expect(decidePull(20, 18)).toBe('cancel') // диагональ — скорее свайп строки
    expect(decidePull(0, -20)).toBe('cancel')
  })

  it('distance follows the finger, then resists and never passes the max', () => {
    expect(pullDistance(-10)).toBe(0)
    expect(pullDistance(20)).toBeGreaterThan(17)
    expect(pullDistance(100)).toBeLessThan(100)
    expect(pullDistance(10_000)).toBeLessThanOrEqual(PULL_MAX)
    // монотонно: дальше тянешь — дальше едет
    expect(pullDistance(150)).toBeGreaterThan(pullDistance(140))
  })

  it('a comfortable pull reaches the threshold', () => {
    const needed = [60, 90, 120, 150, 200].find((dy) => shouldRefresh(pullDistance(dy)))
    expect(needed).toBeDefined()
    expect(needed!).toBeLessThanOrEqual(150)
    expect(pullProgress(PULL_AT / 2)).toBe(0.5)
    expect(pullProgress(PULL_AT * 2)).toBe(1)
  })
})
