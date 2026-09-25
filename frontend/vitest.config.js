import { defineConfig } from 'vitest/config'

// Календарная математика (lib/date.ts) идёт по локальному времени. Зона с переходом на летнее время
// ловит ошибки «потерянного дня», которые в Europe/Moscow (без перехода) не видны; и тесты
// не зависят от часов машины. Воркеры vitest наследуют env главного процесса.
process.env.TZ = 'Europe/Berlin'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // frontend/.env (адрес VPS) не должен попадать в тесты: запросы — относительные, как в Docker-сборке
    env: { VITE_API_URL: '' },
  },
})
