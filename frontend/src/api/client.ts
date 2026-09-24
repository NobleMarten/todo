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
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message || `HTTP ${res.status}`)
  }
  return data as T
}

/** Текст ошибки для показа пользователю. */
export function errorText(e: unknown, fallback = 'что-то пошло не так'): string {
  return e instanceof Error && e.message ? e.message : fallback
}
