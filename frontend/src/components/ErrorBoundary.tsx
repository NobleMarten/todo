import { Component, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/**
 * Ошибка рендера не должна оставлять белый экран: в PWA нет адресной строки,
 * и перезагрузить страницу иначе нечем.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="app">
        <main className="container">
          <div className="error-state crash" role="alert">
            <span className="error-state-title">что-то сломалось</span>
            <span className="error-state-text">данные в порядке — это ошибка интерфейса</span>
            <button className="btn btn-primary" onClick={() => window.location.assign('/today')}>
              перезагрузить
            </button>
          </div>
        </main>
      </div>
    )
  }
}
