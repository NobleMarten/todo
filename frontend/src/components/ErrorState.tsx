import { AlertIcon } from './icons'

interface Props {
  title?: string
  message: string
  onRetry: () => void
}

/** Первая загрузка экрана не удалась и показать нечего. Ошибки действий — полосой error-bar. */
export function ErrorState({ title = 'не удалось загрузить', message, onRetry }: Props) {
  return (
    <div className="error-state" role="alert">
      <AlertIcon size={20} />
      <span className="error-state-title">{title}</span>
      <span className="error-state-text">{message}</span>
      <button className="btn" onClick={onRetry}>
        повторить
      </button>
    </div>
  )
}
