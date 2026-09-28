import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * <link rel="preload"> для основного начертания (Geist 400, latin + cyrillic): без него браузер узнаёт
 * о шрифте только после разбора CSS и первой раскладки, и текст успевает нарисоваться системным шрифтом.
 * Имена файлов с хешем известны только в сборке, поэтому ссылки вставляются здесь, а не в index.html.
 */
function preloadFonts() {
  const MAIN = /^assets\/geist-(latin|cyrillic)-400-normal-[\w-]+\.woff2$/
  return {
    name: 'preload-main-font',
    transformIndexHtml(_html, ctx) {
      if (!ctx.bundle) return []
      return Object.keys(ctx.bundle)
        .filter((f) => MAIN.test(f))
        .map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' },
          injectTo: 'head',
        }))
    },
  }
}

// В разработке API — через прокси Vite, с того же адреса, что и фронт: сессия — HttpOnly-cookie,
// и на чужой адрес (VITE_API_URL=http://localhost:8080) браузер её не отправит. VITE_API_URL для dev — пустой.
// Те же префиксы проксирует nginx в проде (nginx.conf).
const API_PREFIXES = ['/tasks', '/projects', '/day', '/stats', '/auth']
const apiTarget = process.env.API_PROXY ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  server: { proxy: Object.fromEntries(API_PREFIXES.map((p) => [p, apiTarget])) },
  plugins: [
    react({
      // React Compiler мемоизирует компоненты и колбэки сам: открытие шита (смена адреса) не перерисовывает
      // экран и строки под ним. Правила, которых он требует, проверяет eslint-plugin-react-hooks.
      babel: { plugins: ['babel-plugin-react-compiler'] },
    }),
    preloadFonts(),
  ],
})
