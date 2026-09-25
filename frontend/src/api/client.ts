// Базовый клиент API. Пустой VITE_API_URL — относительные запросы через nginx того же origin.
const API_URL = import.meta.env.VITE_API_URL ?? ''

// ApiError несёт код из тела ошибки бэкенда ({code, message}), чтобы UI мог на него реагировать.
export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// Сессия кончилась (или вход включили): API ответил 401 UNAUTHORIZED — приложение показывает экран входа.
type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

export function onUnauthorized(fn: UnauthorizedListener): () => void {
  unauthorizedListeners.add(fn)
  return () => {
    unauthorizedListeners.delete(fn)
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

function buildUrl(path: string, query?: Query): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  }
  const qs = q.toString()
  return `${API_URL}${path}${qs ? `?${qs}` : ''}`
}

export async function request<T>(
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'нет связи с сервером')
  }
  const data = await parseJsonSafe(res)
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string }
    const apiErr = new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message || `HTTP ${res.status}`)
    if (apiErr.code === 'UNAUTHORIZED') unauthorizedListeners.forEach((fn) => fn())
    throw apiErr
  }
  return data as T
}

// Бэкенд отдаёт message по-английски («task not found») — пользователю показываем текст по коду.
const MESSAGES: Record<string, string> = {
  NETWORK: 'нет связи с сервером',
  TASK_NOT_FOUND: 'задача не найдена — возможно, её уже удалили',
  PROJECT_NOT_FOUND: 'список не найден — возможно, его уже удалили',
  EMPTY_TITLE: 'у задачи должен быть заголовок',
  TITLE_TOO_LONG: 'слишком длинное название',
  EMPTY_NAME: 'у списка должно быть название',
  INVALID_COLOR: 'неверный цвет',
  INVALID_PRIORITY: 'неизвестный приоритет',
  INVALID_DATE: 'неверная дата',
  SUBTASK_TOO_DEEP: 'у подзадачи не бывает своих подзадач',
  ALREADY_DONE: 'задача уже выполнена',
  ALREADY_UNDONE: 'задача уже в работе',
  NOTHING_TO_UPDATE: 'нечего сохранять',
  UNAUTHORIZED: 'нужно войти',
  WRONG_PASSWORD: 'неверный пароль',
}

/** Текст ошибки для показа пользователю: по коду API, иначе по статусу, иначе fallback. */
export function errorText(e: unknown, fallback = 'что-то пошло не так'): string {
  if (e instanceof ApiError) {
    const known = MESSAGES[e.code]
    if (known) return known
    if (e.status >= 500) return 'сервер не отвечает — попробуй ещё раз'
    return fallback
  }
  return fallback
}
