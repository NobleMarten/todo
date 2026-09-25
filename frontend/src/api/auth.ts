import { request } from './client'

export type AuthStatus = { enabled: boolean; authed: boolean }

/**
 * Включён ли вход и есть ли сессия. Если /auth не проксируется (nginx отдаёт index.html вместо JSON)
 * или бэкенд старый — считаем вход выключенным: иначе приложение заперлось бы навсегда.
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const data = await request<unknown>('GET', '/auth/status').catch(() => null)
  if (data && typeof data === 'object' && 'enabled' in data && 'authed' in data) {
    const d = data as AuthStatus
    return { enabled: Boolean(d.enabled), authed: Boolean(d.authed) }
  }
  return { enabled: false, authed: true }
}

export function login(password: string): Promise<void> {
  return request<void>('POST', '/auth/login', { body: { password } })
}

export function logout(): Promise<void> {
  return request<void>('POST', '/auth/logout')
}
