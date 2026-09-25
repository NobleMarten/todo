import { useCallback, useEffect, useState } from 'react'
import { getAuthStatus, login as apiLogin, logout as apiLogout } from '../api/auth'
import { onUnauthorized } from '../api/client'

export type AuthState = 'checking' | 'in' | 'out'

/** Вход по паролю (APP_PASSWORD на бэкенде). Любой 401 UNAUTHORIZED из API переводит в 'out'. */
export function useAuth() {
  const [state, setState] = useState<AuthState>('checking')
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAuthStatus().then((s) => {
      if (cancelled) return
      setEnabled(s.enabled)
      setState(s.authed ? 'in' : 'out')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () =>
      onUnauthorized(() => {
        setEnabled(true)
        setState('out')
      }),
    [],
  )

  const login = useCallback(async (password: string) => {
    await apiLogin(password)
    setState('in')
  }, [])

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {})
    setState('out')
  }, [])

  return { state, enabled, login, logout }
}
