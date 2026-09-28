import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './theme.css'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { cache } from './lib/cache'
import { persistCache, restoreCache } from './lib/cachePersist'
import { todayStr } from './lib/date'

// Safari не слушает user-scalable=no для пинча, но уважает preventDefault у gesture-событий
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault())

// холодный старт PWA: сразу прошлое состояние экранов, свежее — в фоне
const storage = (() => {
  try {
    return window.localStorage
  } catch {
    return null // Safari с запретом хранилища бросает уже на обращении
  }
})()
restoreCache(cache, storage, todayStr())
if (storage) persistCache(cache, storage, todayStr)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
