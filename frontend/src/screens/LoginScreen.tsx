import { useState, type FormEvent } from 'react'
import { errorText } from '../api/client'
import { Logo } from '../components/ScreenHeader'
import { SpinIcon } from '../components/icons'

interface Props {
  onLogin: (password: string) => Promise<void>
}

/** Экран входа: одно поле пароля. Сессия живёт год, смена APP_PASSWORD разлогинивает все устройства. */
export function LoginScreen({ onLogin }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      await onLogin(password)
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
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          aria-label="пароль"
          aria-invalid={error !== null}
        />
        {error && (
          <span className="login-error" role="alert">
            {error}
          </span>
        )}
        <button className="btn btn-primary btn-big" type="submit" disabled={!password || busy}>
          {busy ? <SpinIcon /> : 'войти'}
        </button>
      </form>
    </div>
  )
}
