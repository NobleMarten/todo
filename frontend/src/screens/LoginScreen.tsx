import { useState, type FormEvent } from 'react'
import { errorText } from '../api/client'
import { Logo } from '../components/ScreenHeader'
import { SpinIcon } from '../components/icons'

interface Props {
  onLogin: (login: string, password: string) => Promise<void>
}

/**
 * Экран входа: логин и пароль. Регистрации нет — пользователей заводит `todo-api user add`.
 * Сессия живёт год и продлевается, пока приложением пользуются.
 */
export function LoginScreen({ onLogin }: Props) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!login.trim() || !password || busy) return
    setBusy(true)
    setError(null)
    try {
      await onLogin(login, password)
    } catch (err) {
      setError(errorText(err, 'не удалось войти'))
      setBusy(false)
    }
  }

  return (
    <div className="screen login-screen">
      <div className="eyebrow">
        <Logo />
      </div>
      <form className="login-form" onSubmit={submit}>
        <h1 className="screen-title">Вход</h1>
        <input
          type="text"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="логин"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoFocus
          aria-label="логин"
          aria-invalid={error !== null}
        />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="пароль"
          aria-invalid={error !== null}
        />
        {error && (
          <span className="login-error" role="alert">
            {error}
          </span>
        )}
        <button className="btn btn-primary btn-big" type="submit" disabled={!login.trim() || !password || busy}>
          {busy ? <SpinIcon /> : 'войти'}
        </button>
      </form>
    </div>
  )
}
