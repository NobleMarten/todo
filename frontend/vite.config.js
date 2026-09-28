import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      // React Compiler мемоизирует компоненты и колбэки сам: открытие шита (смена адреса) не перерисовывает
      // экран и строки под ним. Правила, которых он требует, проверяет eslint-plugin-react-hooks.
      babel: { plugins: ['babel-plugin-react-compiler'] },
    }),
  ],
})
