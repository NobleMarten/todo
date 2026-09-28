import { useCallback, useEffect, useState } from 'react'
import { getAuthStatus, login as apiLogin, logout as apiLogout } from '../api/auth'
import { onUnauthorized } from '../api/client'
import { cache } from '../lib/cache'
import { forgetCache } from '../lib/cachePersist'

export type AuthState = 'checking' | 'in' | 'out'

/** Задачи прошлого пользователя не должны пережить смену пользователя ни в памяти, ни в хранилище. */
function dropCache() {
  try {
    forgetCache(cache, window.localStorage)
  } catch {
    forgetCache(cache, null)
  }
}

/**
 * Вход по логину и паролю; у каждого пользователя свои задачи. Любой 401 UNAUTHORIZED из API
 * (сессия истекла или закрыта сменой пароля) переводит в 'out'. login — кто вошёл (null — неизвестно).
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>('checking')
  const [user, setUser] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAuthStatus().then((s) => {
      if (cancelled) return
      setUser(s.login)
      setState(s.authed ? 'in' : 'out')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => onUnauthorized(() => setState('out')), [])

  const login = useCallback(async (loginName: string, password: string) => {
    const who = await apiLogin(loginName, password)
    // на этом устройстве мог сидеть другой пользователь: его кэш не показываем ни на миг
    dropCache()
    setUser(who)
    setState('in')
  }, [])

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {})
    dropCache()
    setUser(null)
    setState('out')
  }, [])

  return { state, user, login, logout }
}
