import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, errorText, request } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('request', () => {
  it('строит query без пустых значений и отдаёт JSON', async () => {
    const fetch = stubFetch(async () => Response.json({ items: [], total: 0 }))
    const got = await request('GET', '/tasks', {
      query: { view: 'today', today: '2026-09-25', limit: 1, project_id: null, from: undefined, to: '' },
    })

    expect(got).toEqual({ items: [], total: 0 })
    expect(fetch.mock.calls[0][0]).toBe('/tasks?view=today&today=2026-09-25&limit=1')
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: undefined, body: undefined })
  })

  it('тело — JSON с Content-Type, null в теле сохраняется', async () => {
    const fetch = stubFetch(async () => Response.json({ id: 1 }))
    await request('PATCH', '/tasks/1', { body: { due_date: null } })

    const init = fetch.mock.calls[0][1]!
    expect(init.body).toBe('{"due_date":null}')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('204 без тела → null', async () => {
    stubFetch(async () => new Response(null, { status: 204 }))
    await expect(request('DELETE', '/tasks/1')).resolves.toBeNull()
  })

  it('ошибка API → ApiError с кодом и статусом', async () => {
    stubFetch(async () => Response.json({ code: 'TASK_NOT_FOUND', message: 'task not found' }, { status: 404 }))
    const err = await request('GET', '/tasks/9').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 404, code: 'TASK_NOT_FOUND', message: 'task not found' })
  })

  it('ошибка без JSON (plain text от ServeMux, 502 от nginx) → HTTP_<статус>', async () => {
    stubFetch(async () => new Response('404 page not found\n', { status: 404 }))
    await expect(request('GET', '/nope')).rejects.toMatchObject({ status: 404, code: 'HTTP_404', message: 'HTTP 404' })

    stubFetch(async () => new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(request('GET', '/tasks')).rejects.toMatchObject({ status: 502, code: 'HTTP_502' })
  })

  it('сеть недоступна → ApiError NETWORK со статусом 0', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(request('GET', '/day')).rejects.toMatchObject({ status: 0, code: 'NETWORK' })
  })
})

describe('errorText', () => {
  it('известный код — русский текст, английский message не показывается', () => {
    expect(errorText(new ApiError(404, 'TASK_NOT_FOUND', 'task not found'))).toBe(
      'задача не найдена — возможно, её уже удалили',
    )
    expect(errorText(new ApiError(400, 'SUBTASK_TOO_DEEP', 'x'))).toBe('у подзадачи не бывает своих подзадач')
    expect(errorText(new ApiError(0, 'NETWORK', 'x'))).toBe('нет связи с сервером')
  })

  it('неизвестный код: 5xx — «сервер не отвечает», 4xx — fallback', () => {
    expect(errorText(new ApiError(500, 'INTERNAL', 'boom'))).toBe('сервер не отвечает — попробуй ещё раз')
    expect(errorText(new ApiError(502, 'HTTP_502', 'HTTP 502'))).toBe('сервер не отвечает — попробуй ещё раз')
    expect(errorText(new ApiError(400, 'INVALID_QUERY', 'x'), 'не удалось')).toBe('не удалось')
  })

  it('не ApiError — fallback', () => {
    expect(errorText(new Error('x'))).toBe('что-то пошло не так')
    expect(errorText('строка', 'своё')).toBe('своё')
  })
})
