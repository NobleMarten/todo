# todo — документация и system design

Личный планировщик задач одного владельца: **списки (проекты) + даты + подзадачи**, главный экран «Сегодня».
Документ описывает, как система устроена сейчас и что было сделано за этапы 1–11 редизайна.
Подробный журнал каждого этапа — раздел 9 `REDESIGN.md`; API с примерами — `README.md`; шаги на сервере — `OWNER_TODO.md`.

---

## 1. Коротко

| | |
|---|---|
| Пользователи | один владелец, вход по паролю |
| Клиенты | браузер и iPhone (PWA, «на экран Домой») |
| Бэкенд | Go 1.26, стандартная библиотека + `pgx/v5/stdlib`, миграции `goose` |
| База | PostgreSQL 17 |
| Фронтенд | React 19 + TypeScript + Vite (rolldown) + react-router 7 + framer-motion |
| Инфраструктура | Docker Compose на VPS: `db` → `backend` → `frontend` (nginx) ← host nginx |
| Объём кода | ~5,7 тыс. строк Go, ~6 тыс. строк TS/TSX (без тестов) |
| Тесты | ~58 Go-тестов (сервис, хендлеры, контракт репозитория на Postgres, миграции), 124 vitest, сквозные WebKit-сценарии |

---

## 2. Что было и что стало

### Было (до редизайна)
- Одна плоская очередь задач, единственная ось — `priority`.
- Дедлайны вписаны в заголовок («парс сайтов 04.10 дедлайн»).
- `List()` тянул все задачи в память и фильтровал/сортировал/пагинировал в Go.
- Ручной порядок — в `localStorage` (на iPhone и MacBook разный).
- Роутинг — `strings.TrimPrefix`/`Split` в одном методе.
- Миграции — `ALTER TABLE ... IF NOT EXISTS` в конструкторе репозитория, ошибки терялись.
- Даты — `time.Time` в UTC-полночь, фронт сравнивал `.slice(0, 10)`.
- Выполненные в одной выдаче с активными.

### Стало
- Списки + две даты (дедлайн и «делаю») + подзадачи глубиной 1 + повторы.
- Фильтрация, сортировка, пагинация — в SQL.
- Порядок в БД (`position`), общий для всех устройств.
- `http.ServeMux` с паттернами Go 1.22+.
- Версионируемые обратимые миграции `goose`, вшитые в бинарник.
- Календарные даты — отдельный тип `"YYYY-MM-DD"` на бэке и строки на фронте.
- Экраны: Сегодня, Собрать день, Неделя, Списки, Список, Карточка, Итоги, Поиск, Вход.

---

## 3. Хронология этапов

| Этап | Коммит | Что сделано |
|---|---|---|
| 1 | `355d4aa` | goose + embed, `storage.NewDB/Migrate`, типы `Date`, `Opt[T]`, `Project`, новый `Task`; миграции 00001–00004 |
| 2 | `387bcad` | Весь API на ServeMux, репозитории/сервисы, `TaskFilter` → SQL, `FakeRepo` + контрактный тест, миграции 00005–00006, старое — в `_legacy/` |
| 3 | `6b759f7`, `1c92482` | Новый фронт: роутер, токены, `api/*`, хуки, «Списки», «Список», карточка, перетаскивание через `/tasks/reorder`, вёрстка по макетам |
| 4 | `25985a2` | «Сегодня» (по умолчанию), «Собрать день», «Итоги», активность через `/stats/activity` |
| — | `bb5e538` | nginx проксирует новые префиксы, `Dockerfile` копирует `migrations` |
| 5 | `981a417`, `feb6de3` | Свайпы, быстрый ввод с разбором, скелетоны, ошибки, пустые состояния, PWA для iPhone, README/CLAUDE.md; «выполнено» внизу списка, мягкое `#список` |
| 6 | `518a06c` | `tsconfig`, TypeScript 5.9, typescript-eslint, vitest + тесты `lib/` и `api/client` |
| 7 | `811f893` | Вход по паролю, удалён `/tasks/clear`, CI, `scripts/backup.sh`, фикс `29.02`, `npm audit fix` |
| 8 | `10fe408` | Удаление с «вернуть» (отложенный `DELETE`), `@день` работы в быстром вводе |
| 9 | `5e7709e` | Экран «Неделя»: `GET /day/week`, полоса дней, перетаскивание на день, бэклог, дедлайны впереди |
| 10 | `010322c` | Повторяющиеся задачи: миграция 00007, копия при выполнении, поле «повтор», слова в быстром вводе |
| 11 | `a4496ec` | Поиск `GET /tasks?q=`, экран `/search` |
| — | `becba40` | nginx `/auth`, `APP_PASSWORD`/`APP_TZ` в compose; смержено в `main` |

---

## 4. Архитектура

### 4.1 Компоненты и поток запроса

```
 iPhone (PWA) / браузер
        │  http://95.85.252.88:8095
        ▼
 host nginx (VPS, :8095)                       — единственное, что смотрит в интернет
        │  proxy → 127.0.0.1:8091
        ▼
 ┌─ docker compose ─────────────────────────────────────────────────────────┐
 │  frontend  (nginx:alpine, :80 → 127.0.0.1:8091)                           │
 │    /assets/*            → статика Vite, cache 1y immutable                │
 │    /(tasks|projects|day|stats|auth)… → proxy http://backend:8080          │
 │    /healthz             → proxy                                           │
 │    остальное            → index.html (SPA, no-cache)                      │
 │         │                                                                 │
 │         ▼                                                                 │
 │  backend  (Go, :8080 → 127.0.0.1:8082)                                    │
 │    старт: config → NewDB (ping) → Migrate (goose up) → сервисы → mux      │
 │    middleware: CORS → RequireAuth → ServeMux                              │
 │         │                                                                 │
 │         ▼                                                                 │
 │  db  (postgres:17-alpine, том pgdata, 127.0.0.1:5434)                     │
 └───────────────────────────────────────────────────────────────────────────┘
```

- Фронт и API на **одном origin**: браузер не делает кросс-доменных запросов, cookie входа работает, CORS фактически не нужен.
- `resolver 127.0.0.11` + переменная в `proxy_pass`: nginx резолвит `backend` на каждый запрос, иначе после пересоздания контейнера — 502.
- Все порты опубликованы только на `127.0.0.1`.

### 4.2 Слои бэкенда

```
transport  (ServeMux, разбор запроса, WriteError)
    ▼
service    (TaskService, ProjectService, DayService: правила, валидация, сборка вьюх из условий)
    ▼
storage    (TaskRepo, ProjectRepo: PostgresRepo — SQL, FakeRepo — память для тестов)
    ▼
model      (Task, Project, Date, Opt[T], Repeat, ошибки)
```

| Пакет | Файлы | Ответственность |
|---|---|---|
| `cmd/todo-api` | `main.go` | сборка зависимостей, CORS, `/healthz`, graceful shutdown |
| `internal/config` | `config.go` | env: `DB_URL`, `PORT`, `HTTP_SHUTDOWN_TIMEOUT`, `APP_TZ`, `APP_PASSWORD` |
| `internal/model` | `task.go`, `project.go`, `date.go`, `opt.go`, `repeat.go`, `errors.go` | доменные типы и ошибки |
| `internal/storage` | `db.go`, `repo.go`, `postgres_tasks.go`, `postgres_projects.go`, `fake_repo.go` | интерфейсы, SQL, фейк |
| `internal/service` | `task_service.go`, `project_service.go`, `day_service.go`, `week_service.go` | бизнес-правила |
| `internal/transport` | `router.go`, `*_handler.go`, `query_helpers.go`, `errors_helpers.go` | HTTP |
| `internal/auth` | `auth.go` | пароль, сессия |
| `migrations` | `NNNNN_*.sql`, `embed.go` | схема, вшивается через `embed` |

### 4.3 Ключевые механизмы бэкенда

- **Фильтр → SQL.** `storage.TaskFilter` — набор условий, объединяемых через AND (`Done`, `ProjectID`, `Inbox`, `ScheduledOn`, `NotScheduledOn`, `ScheduledBefore`, `DueBefore`, `DueBetween`, `AnyDateBetween`, `NoDates`, `CreatedBetween`, `DoneBetween`, `UpdatedBefore`, `Search`).
  - Сервис собирает вьюхи и блоки экранов из этих условий.
  - `PostgresRepo.filterConds` переводит их в `WHERE`, `orderBy` — в `ORDER BY` по белому списку.
  - Аргументы — `pgx.NamedArgs`, конкатенации значений в SQL нет.
- **Контрактный тест.** `repo_contract_test.go` гоняет один сценарий на `FakeRepo` всегда и на `PostgresRepo` при `TEST_DB_URL`. Поэтому тесты сервиса на фейке значат то же, что на проде. Любая правка репозитория делается в обоих.
- **PATCH с тремя состояниями.** `model.Opt[T]` отличает «ключа нет» от `null`: `{"due_date": null}` очищает, отсутствие ключа не трогает. `UPDATE` собирается динамически из присутствующих полей, без `COALESCE`.
- **Календарная дата.** `model.Date{Year, Month, Day}`: JSON и SQL — `"YYYY-MM-DD"`, нулевое значение — `null`. Всё «сегодня/вчера» считается в `APP_TZ` (по умолчанию `Europe/Moscow`); клиент может передать свой `today=`.
- **Ошибки.** Сентинелы в `model/errors.go` → таблица `errorCodes` → статус + `{code, message}`. Неизвестная ошибка логируется и уходит как 500 без подробностей.
- **Только корневые задачи в выдачах.** Все списки и блоки возвращают `parent_id IS NULL` + `subtask_stats {done,total}`; подзадачи — только в `GET /tasks/{id}`.
- **Новые задачи и списки** получают `MAX(position)+1` — встают в конец.

---

## 5. Данные

### 5.1 Схема

```sql
projects
  id          SERIAL PK
  name        TEXT NOT NULL
  color       TEXT NOT NULL DEFAULT '#6AA6FF'
  position    INT  NOT NULL DEFAULT 0
  archived    BOOLEAN NOT NULL DEFAULT false
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()

tasks
  id            SERIAL PK
  title         TEXT NOT NULL                     -- до 120 символов (сервис)
  done          BOOLEAN NOT NULL DEFAULT false
  priority      VARCHAR(10) NOT NULL DEFAULT 'low' -- high | medium | low
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  done_at       TIMESTAMPTZ
  project_id    INT → projects(id) ON DELETE SET NULL   -- NULL = «входящие»
  parent_id     INT → tasks(id)    ON DELETE CASCADE    -- подзадача, глубина 1
  due_date      DATE        -- дедлайн: «позже нельзя»
  scheduled_for DATE        -- «делаю»: день, когда садишься за задачу (бывший daily)
  position      INT NOT NULL DEFAULT 0
  note          TEXT
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()  -- правка через PATCH/план; reorder не считается
  repeat        TEXT        -- правило повтора, NULL — нет
```

Индексы: `projects(archived, position)`, `tasks(project_id)`, `tasks(parent_id)`, `tasks(scheduled_for)`, `tasks(due_date)`, частичный `tasks(done) WHERE done = false`.

### 5.2 Миграции

| № | Up | Down |
|---|---|---|
| 00001 | таблица `projects` + индекс | удалить `projects` |
| 00002 | идемпотентная базовая `tasks`; `daily` → `scheduled_for` (данные сохраняются); новые колонки; `position = id` | новые колонки удаляются, `scheduled_for` → `daily` |
| 00003 | 6 списков владельца (Go, Учёба, Todo, Finance-Tracker, Стажировка, Личное); задачи не раскладываются | удалить списки по имени |
| 00004 | индексы `tasks` | удалить индексы |
| 00005 | `updated_at`, backfill `COALESCE(done_at, created_at)` | удалить колонку |
| 00006 | `priority` NOT NULL, NULL и мусор → `low` | снять NOT NULL (значения не возвращаются) |
| 00007 | `repeat TEXT` | удалить колонку (теряются только правила) |

Правила:
- Одна миграция — один файл `NNNNN_name.sql`, секции `-- +goose Up/Down`, каждая в транзакции.
- Колонки с данными переименовываются, не удаляются.
- Применяются на старте бэкенда (`storage.Migrate`), отдельный бинарник goose на VPS не нужен.
- `db/init.sql` создаёт старую таблицу только на пустом томе Docker; схему меняют только миграциями.

---

## 6. API

Все ответы — JSON, ошибки — `{"code", "message"}`. При включённом входе всё, кроме `/auth/*` и `/healthz`, без сессии → `401 UNAUTHORIZED`.

| Метод и путь | Назначение |
|---|---|
| `GET /healthz` | liveness для Docker, БД не трогает |
| `GET /auth/status` | `{enabled, authed}` |
| `POST /auth/login` | `{password}` → 204 + cookie; неверный → 401 `WRONG_PASSWORD` |
| `POST /auth/logout` | стереть cookie |
| `GET /projects` | списки со счётчиками `{active, overdue}`; `?archived=true` — с архивными |
| `POST /projects` | `{name, color}` |
| `PATCH /projects/{id}` | `{name?, color?, archived?}` |
| `DELETE /projects/{id}` | задачи уходят во «входящие» |
| `POST /projects/reorder` | `{ids}` |
| `GET /tasks` | вьюхи (ниже) → `{items, total}` |
| `GET /tasks/{id}` | задача + `subtasks` |
| `POST /tasks` | `{title, priority?, project_id?, parent_id?, due_date?, scheduled_for?, repeat?}` |
| `PATCH /tasks/{id}` | любые поля, три состояния |
| `DELETE /tasks/{id}` | подзадачи каскадом |
| `POST /tasks/reorder` | `{scope: project|inbox|day, ids}` — одной транзакцией |
| `GET /day?date=` | экран «Сегодня» |
| `GET /day/suggestions?date=` | «Собрать день» |
| `POST /day/plan` | `{date, add, remove}` |
| `GET /day/week?from=` | «Неделя» |
| `GET /stats/activity?from=&to=` | `[{date, done}]` для грида активности |

**Вьюхи `GET /tasks`** (везде только невыполненные корневые, кроме `archive`):

| `view` | условие |
|---|---|
| `all` (по умолч.) | все активные |
| `today` | `scheduled_for = today` |
| `week` | дедлайн или «делаю» в `[today, today+7]` |
| `overdue` | `due_date < today` |
| `inbox` | без списка |
| `project` | `project_id` (обязателен) |
| `archive` | выполненные, свежие сверху, лимит 50 (макс. 200) |

Общие параметры: `q`, `project_id`, `done` (переопределяет вьюху), `from`+`to`, `limit`, `offset`, `sort=position|due_date|priority|created_at|done_at`, `order`, `today`.

**Коды ошибок:** 400 — `INVALID_ID`, `INVALID_DATE`, `INVALID_VIEW`, `INVALID_QUERY`, `INVALID_BODY`, `INVALID_REPEAT`, `EMPTY_TITLE`, `TITLE_TOO_LONG`, `EMPTY_NAME`, `INVALID_COLOR`, `INVALID_PRIORITY`, `NOTHING_TO_UPDATE`, `NOT_DONE`, `SUBTASK_TOO_DEEP`; 401 — `UNAUTHORIZED`, `WRONG_PASSWORD`; 404 — `TASK_NOT_FOUND`, `PROJECT_NOT_FOUND`; 409 — `ALREADY_DONE`, `ALREADY_UNDONE`; 500 — `INTERNAL_SERVER_ERROR`.

---

## 7. Доменные правила

### 7.1 Задачи
- `done: true` ставит `done_at = now()`, `done: false` снимает; повторное — 409.
- Подзадача: глубина ровно 1. Родитель корневой, у будущей подзадачи нет своих → иначе 400 `SUBTASK_TOO_DEEP`.
- Подзадача живёт в списке родителя: при создании получает его `project_id`, при смене списка у родителя переезжает с ним.
- Дедлайн в прошлом разрешён (это просрочка), формат даты проверяется.

### 7.2 «Сегодня» (`/day`)
- `planned` — `scheduled_for = date`.
- `overdue` — `due_date < date`.
- `carry_over` — `scheduled_for < date` («вчера не доделал»).
- `done_today` — `done_at` попадает в дату по `APP_TZ`.
- Каждая задача ровно в одном блоке, приоритет planned → overdue → carry_over.

### 7.3 «Собрать день» (`/day/suggestions`)
- Просроченные дедлайны, дедлайны в ближайшие 7 дней, `stale` — без дат и не тронутые 14 дней (до 10, старые сверху).
- Уже запланированное на дату не предлагается.

### 7.4 «Неделя» (`/day/week`)
- 7 дней с `from` (без него — понедельник текущей недели в `APP_TZ`).
- День: `scheduled` (`scheduled_for = день`), `deadlines` (`due_date = день`, если не запланирована на этот же день), `done`.
- Задача с датами в разных днях видна в обоих.
- `upcoming` — до 6 дедлайнов в 60 днях после недели; `backlog` — до 30 задач без дат + общее число.
- Собирается из существующих условий фильтра, репозиторий не менялся.

### 7.5 Повторы
- Правило: `daily | weekdays | weekly:1,4 (1 = пн) | monthly:15` (в коротком месяце — последнее число). Сервис приводит к канону.
- Повторяться может только корневая задача.
- При `done: true` у повторяющейся:
  1. у выполненной правило снимается (она становится историей);
  2. создаётся копия: заголовок, приоритет, список, заметка, правило; без подзадач;
  3. даты копии: опора — «делаю», иначе дедлайн, иначе сегодня → следующий день по правилу, **не раньше сегодня**; обе даты сдвигаются на одно число дней; без дат — «делаю» = день по правилу;
  4. если копия не создалась — выполнение откатывается.
- Снять галочку с выполненной и выполнить снова — вторая копия не появляется.

### 7.6 Порядок
- Одна колонка `position` на все области: список, входящие, день.
- `reorder` — один `UPDATE … FROM unnest(@ids) WITH ORDINALITY`; id вне области игнорируются.

### 7.7 Поиск
- `title ILIKE %q% OR note ILIKE %q%`, `%`, `_`, `\` в запросе — буквально.
- До 100 символов; только корневые задачи.
- Регистр складывается по `lc_ctype` базы (в `postgres:17-alpine` кириллица работает — проверено).

---

## 8. Фронтенд

### 8.1 Структура

```
frontend/src/
  api/        client.ts (request, ApiError, errorText, onUnauthorized), tasks.ts, projects.ts, day.ts, auth.ts, types.ts
  hooks/      useTasks (useTasks, useTask, useArchive, счётчики), useDay, useWeek, useProjects,
              useActivity, useSearch, useAuth, useTheme, useOpenTask, useAutosize
  lib/        date, format, quickAdd, repeat, sync, pendingDelete, deleting, nav
  components/ TaskRow, SwipeRow, DayDrag, TaskRun (Reorder), TaskSheet, Sheet, QuickAdd, DatePicker,
              RepeatField, UndoToast, TabBar, ScreenHeader, Skeleton, ErrorState, ErrorBoundary, Activity, …
  screens/    Today, PlanDay, Week, Lists, Project, Archive, Search, Login
  theme.css   токены (тёмная по умолчанию, [data-theme='light'])
  index.css   компоненты
```

### 8.2 Маршруты

| Маршрут | Экран |
|---|---|
| `/` → `/today` | «Сегодня»: прогресс, фокус дня, просрочено, план, готово |
| `/plan` | «Собрать день» |
| `/week?from=&day=` | «Неделя» |
| `/lists` | смарт-виды + списки |
| `/lists/:id` | список (число или `inbox|all|today|week|overdue`) |
| `/archive` | «Итоги»: грид активности, выполненные по дням, «выйти» |
| `/search?q=` | поиск |
| `/task/:id` | карточка-шит поверх экрана из `location.state.background` |

Таб-бар: сегодня · неделя · списки · итоги. Скрыт внутри списка (там поле ввода) и на «Собрать день».

### 8.3 Данные на клиенте
- **Хуки = источник данных экрана.** Загрузка, скелетон, ошибка, мутации.
- **Оптимистичные мутации с откатом.** Состояние меняется сразу, при ошибке возвращается снимок + полоса ошибки.
- **Шина `lib/sync`.** После мутации `notifyChanged()` — остальные подписанные хуки тихо перечитываются (карточка ↔ список ↔ «Сегодня»).
- **Удаление с «вернуть» (`lib/pendingDelete`).**
  - Задача прячется сразу, `DELETE` уходит через 5 с.
  - Следующее удаление или уход приложения в фон проводят его немедленно.
  - Спрятанные id фильтруются прямо в `api/*`, поэтому фоновые перечитывания не воскрешают задачу.
  - «Вернуть» = убрать из фильтра + перечитать всё.
- **Даты только локальные.** Вся календарная математика — строками `YYYY-MM-DD` по дате устройства; каждый GET несёт `today=`.
- **Вход.** Любой ответ `401 UNAUTHORIZED` → событие `onUnauthorized` → `useAuth` → экран входа.

### 8.4 Быстрый ввод (`lib/quickAdd`)

| Токен | Значение |
|---|---|
| `#список` | список: без регистра, ё = е, без пробелов/знаков, однозначное начало имени (`#fin`) |
| `!срочно` / `!важно` / `!обычно` | приоритет |
| `ДД.ММ`, `ДД.ММ.ГГ(ГГ)`, `завтра`, `пн…вс` | дедлайн; ДД.ММ в прошлом → следующий год, 29.02 → ближайший високосный |
| `@` + дата или `@сегодня` | «делаю» |
| `ежедневно`, `по-будням`, `еженедельно`, `ежемесячно` | повтор (неделя/месяц — от даты задачи); без дат — «делаю» = ближайший день по правилу |

- Каждого вида берётся первое совпадение, остальное — заголовок.
- Распознанное показывается чипами до отправки; при наборе `#` — подсказки списков.

### 8.5 Жесты
- **Свайп строки** (`SwipeRow`, framer `drag="x"`): влево — кнопка «удалить», вправо — «на сегодня». Жест стартует вручную через `dragControls`: framer не начинает drag на вложенной кнопке.
- **Сортировка** (`TaskRun`, framer `Reorder`) — только за ручку; ручка слушает `pointerdown` нативно со `stopPropagation`, чтобы не стартовал свайп.
- **Перетаскивание на день** (`DayDrag`): строка — за ручку, чип бэклога — целиком. День под пальцем — `elementsFromPoint` → `[data-day]`, результат — `PATCH scheduled_for`.

### 8.6 PWA и вид
- `viewport-fit=cover`, safe-area отступы, `apple-mobile-web-app-capable`, `theme-color` под тему.
- `manifest.json`: `start_url: /today`.
- Service Worker нет — он требует HTTPS.
- Касание ≥ 44×44, строка ≥ 56 px, поля ≥ 16 px (иначе iOS зумит).
- Цвет приоритета — обводка круглого чекбокса; моноширинный шрифт — только для цифр, дат и ярлыков.

---

## 9. Безопасность

| Угроза | Защита | Остаточный риск |
|---|---|---|
| Любой, кто знает адрес, читает и удаляет задачи | вход по `APP_PASSWORD`, `RequireAuth` на всём, кроме `/auth/*` и `/healthz` | пустой `APP_PASSWORD` = вход выключен (WARNING в логе) |
| Перебор пароля | пауза 1 с после неверного пароля под мьютексом → ≤ 1 попытка/с на процесс | длинный случайный пароль обязателен |
| Кража cookie через JS | `HttpOnly`, `SameSite=Lax` | — |
| Перехват в сети | — (HTTPS нет) | пароль и cookie идут открытым текстом |
| Украденная cookie | сессия = HMAC(пароль); смена пароля разлогинивает всё | до смены пароля cookie действует год |
| Массовое стирание | `POST /tasks/clear` удалён | — |
| SQL-инъекции | только именованные аргументы, сортировка по белому списку | — |
| Доступ к БД/API снаружи | порты на `127.0.0.1`, наружу только host nginx | — |

---

## 10. Инфраструктура и эксплуатация

### 10.1 Конфигурация (env)

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `DB_URL` | — (обязательна) | строка подключения; в compose собирается из `POSTGRES_*` |
| `PORT` | 8080 | порт API |
| `HTTP_SHUTDOWN_TIMEOUT` | 10s | graceful shutdown; `stop_grace_period` в compose — 20s, должен быть больше |
| `APP_TZ` | Europe/Moscow | «сегодня» и границы дней; `Local` запрещён (имя зоны уходит в Postgres) |
| `APP_PASSWORD` | пусто | пароль входа |
| `VITE_API_URL` | пусто | build-arg фронта; пусто = относительные запросы через свой nginx |
| `TEST_DB_URL` | — | Postgres для контрактных тестов и тестов миграций |

### 10.2 Сборка и запуск
- **Backend image:** multi-stage `golang:1.26-alpine` → `alpine`; копирует `cmd`, `internal`, `migrations`.
- **Frontend image:** `node:22-alpine` (`npm ci`, `npm run build` = `tsc` + `vite build`) → `nginx:1.27-alpine`.
- **Healthchecks:** `db` — `pg_isready`, `backend` — `wget /healthz`; `backend` ждёт `db: service_healthy`.
- **Деплой:** `git pull && docker compose up -d --build`, миграции — при старте бэкенда.

### 10.3 Бэкапы (`scripts/backup.sh`)
1. `pg_dump --clean --if-exists` из контейнера `db` → gzip.
2. Проверка маркера «dump complete»: оборванный дамп не вытесняет хорошие копии.
3. Ротация — `KEEP=14` последних в `~/todo-backups`.
4. Запуск раз в сутки через cron; восстановление — `gunzip | psql` (в шапке скрипта).

### 10.4 CI (`.github/workflows/ci.yml`)
- На каждый push и PR.
- **backend:** Postgres 17 service → `TEST_DB_URL`; `go build`, `go vet`, `gofmt`, `go test`.
- **frontend:** node 22; `npm ci`, `lint`, `test`, `build`.

---

## 11. Тестирование

| Уровень | Где | Что проверяет |
|---|---|---|
| Модель | `model/*_test.go` | `Date` (JSON/SQL), `Opt[T]`, `Repeat` (разбор, следующий день) |
| Сервис | `service/*_test.go` на `FakeRepo` | вьюхи, PATCH-правила, подзадачи, день/неделя/подсказки, повторы |
| HTTP | `transport/*_test.go` через `httptest` на настоящем роутере | статусы, коды ошибок, вход, неделя, поиск |
| Контракт | `storage/repo_contract_test.go` | одинаковое поведение `FakeRepo` и `PostgresRepo` |
| Миграции | `storage/migrate_test.go` | старые данные → up → down-to 0 → up; пустая база; NULL priority |
| Фронт (unit) | `src/**/*.test.ts`, vitest, TZ=Europe/Berlin | даты (через перевод часов), быстрый ввод, секции, повторы, отложенное удаление, API-клиент |
| Сквозные | Playwright WebKit, профиль iPhone 13 (вне репозитория) | вход/выход, «Неделя» и перетаскивания, «вернуть», повторы, поиск |
| Смоук Docker | локальный `docker compose` | образы, миграции на старой схеме, nginx `/auth`, бэкап и восстановление |

```bash
go build ./... && go vet ./... && go test ./...
TEST_DB_URL=postgres://… go test ./internal/storage
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

---

## 12. Решения и компромиссы

| Решение | Почему | Цена |
|---|---|---|
| Стандартная библиотека Go, без фреймворков и ORM | мало кода, понятный SQL, ServeMux хватает | ручной `scanTask`, динамический UPDATE |
| Фильтр как набор условий + `FakeRepo` + контракт | быстрые тесты сервиса без БД и уверенность, что они про прод | каждая правка репозитория — в двух местах |
| Миграции на старте из embed | деплой = `git pull && up`, без отдельного инструмента | одна реплика; нет advisory-lock |
| Одна `position` на все области | простая схема | порядок в дне и в списке влияют друг на друга |
| Даты строками на клиенте | UTC-разбор `Date` теряет день | своя маленькая библиотека дат |
| Шина «перечитай всё» | карточка, списки и экраны синхронны без стора | лишние GET после каждой мутации (дёшево при сотнях задач) |
| Отложенный `DELETE` на клиенте вместо мягкого удаления | без миграции и корзины | закрыли вкладку за 5 с — задача остаётся |
| Сессия без состояния (HMAC от пароля) | не нужна таблица сессий | нельзя отозвать одну сессию, только сменить пароль |
| Повтор = копия при выполнении | одна строка на правило, история в «Итогах» | выполнение и создание копии — не одна транзакция |
| `ILIKE` без индекса | сотни задач — миллисекунды | зависит от локали БД; при росте — pg_trgm |

---

## 13. Ограничения и долги

- **Не задеплоено.** Прод на `0182613` (до редизайна); первый старт прогонит миграции 00001–00007 на боевой базе. Шаги — `OWNER_TODO.md`.
- **Нет HTTPS**, а значит нет Service Worker, офлайна и push-напоминаний.
- **Реальный iPhone не проверялся** на этапах 5–11 (только эмуляция WebKit).
- Одна `position` на все области; подзадачи нельзя переставлять.
- Подзадачам можно поставить даты, но ни одна вьюха их не покажет.
- Правило глубины подзадач — check-then-act без блокировки (при одном пользователе гонок нет).
- 404/405 самого ServeMux — plain text; тело > 1 МБ → 400, а не 413.
- `react-hooks/set-state-in-effect` выключено: загрузка в эффектах — осознанно.
- Сквозные сценарии Playwright не лежат в репозитории.

---

## 14. Где что искать

| Нужно | Файл |
|---|---|
| Спека и журнал этапов | `REDESIGN.md` (раздел 9) |
| API с примерами curl | `README.md` |
| Как работать с кодом (для Claude Code) | `CLAUDE.md` |
| Шаги на сервере | `OWNER_TODO.md` |
| История переезда с systemd на Docker | `MIGRATION.md` |
| Макеты экранов | `design/*.html` |
