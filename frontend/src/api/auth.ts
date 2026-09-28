import { request } from './client'

export type AuthStatus = { authed: boolean; login: string | null }

/**
 * Есть ли сессия и чья она. Сеть недоступна или /auth не отвечает JSON (nginx отдал index.html) —
 * пускаем в приложение с кэшем: первый же запрос к API с 401 вернёт на экран входа.
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const data = await request<unknown>('GET', '/auth/status').catch(() => null)
  if (data && typeof data === 'object' && 'authed' in data) {
    const d = data as { authed: unknown; user?: { login?: unknown } }
    return { authed: Boolean(d.authed), login: typeof d.user?.login === 'string' ? d.user.login : null }
  }
  return { authed: true, login: null }
}

/** Вход: 200 {login} + cookie сессии; неверный логин или пароль — 401 WRONG_PASSWORD. */
export async function login(loginName: string, password: string): Promise<string> {
  const res = await request<{ login: string }>('POST', '/auth/login', { body: { login: loginName, password } })
  return res.login
}

export function logout(): Promise<void> {
  return request<void>('POST', '/auth/logout')
}
