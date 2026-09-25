# todo

Личный планировщик: **списки (проекты) + даты + подзадачи**, главный экран — «Сегодня».
Бэкенд на Go (стандартная библиотека + `pgx/v5/stdlib`, миграции `goose`), база — Postgres,
фронтенд — React 19 + Vite + TypeScript + framer-motion, ставится на iPhone как PWA.

```
cmd/todo-api/        HTTP API: конфиг, NewDB → Migrate → роутер, CORS, graceful shutdown
migrations/          SQL-миграции goose, вшиты в бинарник (embed) и применяются на старте
internal/
  model/             Task, Project, Date ("YYYY-MM-DD"), Opt[T] (PATCH: нет ключа / null / значение), ошибки
  storage/           интерфейсы репозиториев, PostgresRepo, FakeRepo (для тестов), NewDB/Migrate
  service/           задачи, списки, день («Сегодня», «Собрать день»)
  transport/         роутер на http.ServeMux с паттернами, хендлеры, WriteError
frontend/            SPA: экраны «Сегодня», «Собрать день», «Списки», список, карточка задачи, «Итоги»
_legacy/             старые CLI и файловое хранилище, не собираются
```

## Запуск

```bash
cp .env.example .env              # DB_URL обязателен
go run ./cmd/todo-api             # сам прогонит миграции
cd frontend && npm install && npm run dev
```

Весь стек в Docker: `docker compose up -d --build` (фронт на `:8081`, API на `:8080`).

| переменная              | по умолчанию     | что это                                                           |
|-------------------------|------------------|-------------------------------------------------------------------|
| `DB_URL`                | —                | строка подключения к Postgres, без неё API не стартует            |
| `PORT`                  | `8080`           | порт API                                                          |
| `HTTP_SHUTDOWN_TIMEOUT` | `10s`            | сколько ждать активные запросы при остановке                      |
| `APP_TZ`                | `Europe/Moscow`  | таймзона приложения: в ней считаются «сегодня», просрочка, дни    |
| `APP_PASSWORD`          | пусто            | пароль входа; пусто — вход выключен и API открыт (только для разработки) |
| `VITE_API_URL`          | пусто            | адрес API для фронта (build arg); пусто — относительные запросы   |
| `TEST_DB_URL`           | —                | база для тестов репозитория и миграций; без неё они пропускаются  |

Проверки: `go build ./... && go vet ./... && go test ./...`, во `frontend/` — `npm run build && npm run lint && npm test`.
То же гоняет CI (`.github/workflows/ci.yml`) на каждый push, Go-тесты — с настоящим Postgres.

Бэкап базы из compose: `scripts/backup.sh` (gzip, последние 14 копий; cron и восстановление — в шапке скрипта).

## Модель

```jsonc
// Task
{
  "id": 12, "title": "докер для todo", "done": false,
  "priority": "high",            // high | medium | low — цвет чекбокса и порядок внутри секции
  "project_id": 3,               // null — «входящие»
  "parent_id": null,             // подзадача; глубина ровно 1
  "due_date": "2026-09-25",      // дедлайн — когда нельзя позже
  "scheduled_for": "2026-09-24", // делаю — когда сажусь за неё
  "position": 7, "note": null,
  "created_at": "…", "done_at": null, "updated_at": "…",
  "subtask_stats": {"done": 1, "total": 3}   // в выдачах списков
}
// Project
{"id": 3, "name": "Todo", "color": "#7DE0D1", "position": 2, "archived": false, "created_at": "…",
 "counts": {"active": 4, "overdue": 1}}       // только в GET /projects
```

Все календарные даты — строки `"YYYY-MM-DD"` без времени. Клиент передаёт свою локальную дату
параметром `today=`; без него берётся текущая дата в `APP_TZ`.

## API

Все ответы — JSON. Ошибки — `{"code": "...", "message": "..."}` с HTTP-статусом (см. ниже).

### Вход

Если задан `APP_PASSWORD`, всё, кроме `/auth/*` и `/healthz`, без сессии отвечает `401 UNAUTHORIZED`.

| запрос               | тело         | ответ                                                       |
|----------------------|--------------|-------------------------------------------------------------|
| `GET /auth/status`   | —            | `{enabled, authed}`                                          |
| `POST /auth/login`   | `{password}` | `204` + HttpOnly-cookie `todo_session` на год; неверный — `401 WRONG_PASSWORD` (с паузой 1 с) |
| `POST /auth/logout`  | —            | `204`, cookie стёрта                                         |

Сессия без состояния: cookie = HMAC от пароля, смена `APP_PASSWORD` разлогинивает все устройства.
Без HTTPS пароль и cookie идут по сети открытым текстом — это защита от случайных посетителей, не от перехвата.
Cookie работает только при same-origin (фронт и API за одним nginx): с `VITE_API_URL` на другой хост вход не заработает.

### Списки

| запрос                        | тело                                  | ответ                         |
|-------------------------------|---------------------------------------|-------------------------------|
| `GET /projects`               | — (`?archived=true` — вместе с архивными, `?today=`) | `[Project]`    |
| `POST /projects`              | `{name, color}`                       | `201 Project`                 |
| `PATCH /projects/{id}`        | `{name?, color?, archived?}`          | `Project`                     |
| `DELETE /projects/{id}`       | —                                     | `204`, задачи уходят во входящие |
| `POST /projects/reorder`      | `{ids: [3, 1, 2]}`                    | `204`                         |

Цвет — `#RRGGBB`, имя — до 60 символов.

### Задачи

| запрос                  | тело                                                                  | ответ                  |
|-------------------------|-----------------------------------------------------------------------|------------------------|
| `GET /tasks?view=…`     | —                                                                     | `{items, total}`       |
| `GET /tasks/{id}`       | —                                                                     | `Task` + `subtasks: [Task]` |
| `POST /tasks`           | `{title, priority?, project_id?, parent_id?, due_date?, scheduled_for?}` | `201 Task`          |
| `PATCH /tasks/{id}`     | любые из `title, done, priority, project_id, parent_id, due_date, scheduled_for, note` | `Task` |
| `DELETE /tasks/{id}`    | —                                                                     | `204`, подзадачи — каскадом |
| `POST /tasks/reorder`   | `{scope, ids}`                                                        | `204`                  |

Вьюхи `GET /tasks` (фильтрация в SQL; везде только корневые задачи с `subtask_stats`):

| `view`             | что возвращает                                                               |
|--------------------|------------------------------------------------------------------------------|
| `all` (по умолч.)  | невыполненные                                                                |
| `today`            | невыполненные, `scheduled_for = today`                                       |
| `week`             | невыполненные, `due_date` или `scheduled_for` в `[today, today + 7]`         |
| `overdue`          | невыполненные, `due_date < today`                                            |
| `inbox`            | невыполненные без списка                                                     |
| `project`          | невыполненные списка `project_id` (обязателен)                               |
| `archive`          | выполненные, свежие сверху; `limit` по умолчанию 50, максимум 200            |

Параметры: `project_id`, `done` (переопределяет условие вьюхи), `from` + `to` (только парой:
`done_at` в `archive`, `created_at` в остальных), `limit`, `offset`,
`sort=position|due_date|priority|created_at|done_at`, `order=asc|desc`, `today`.
Сортировка по умолчанию — `position ASC, id ASC`; пустые даты всегда в конце.

**PATCH различает «нет ключа» и `null`**: `{"due_date": null}` очищает дедлайн, отсутствие ключа его
не трогает. `done: true` ставит `done_at`, `done: false` снимает; повторное — `409`.
`parent_id` можно поставить только задаче без подзадач и только на корневую — иначе `400 SUBTASK_TOO_DEEP`.
Подзадача живёт в списке родителя: при смене `project_id` у родителя подзадачи переезжают вместе с ним.

`scope` у reorder: `{"type": "project", "project_id": 5}`, `{"type": "inbox"}` или
`{"type": "day", "date": "2026-09-21"}`. `position` = индекс в `ids`, одной транзакцией;
id не из области видимости игнорируются.

```bash
curl -X POST localhost:8080/tasks -d '{"title":"отчёт","project_id":1,"due_date":"2026-10-04"}'
curl -X PATCH localhost:8080/tasks/12 -d '{"scheduled_for":"2026-09-24"}'
curl -X PATCH localhost:8080/tasks/12 -d '{"due_date":null}'
curl -X POST localhost:8080/tasks/reorder -d '{"scope":{"type":"inbox"},"ids":[4,9]}'
```

### День

| запрос                          | ответ                                                                  |
|---------------------------------|------------------------------------------------------------------------|
| `GET /day?date=YYYY-MM-DD`      | `{date, planned, overdue, carry_over, done_today, counts: {planned, done, overdue}}` |
| `GET /day/suggestions?date=`    | `{overdue, due_soon, stale}`                                           |
| `POST /day/plan`                | тело `{date, add: [id], remove: [id]}` → `204`                         |
| `GET /stats/activity?from=&to=` | `[{date, done}]`, только дни с выполненными; без параметров — последний год |

- `planned` — `scheduled_for = date`; `overdue` — `due_date < date`; `carry_over` — `scheduled_for < date`
  («вчера не доделал»); `done_today` — выполненные в этот день по `APP_TZ`. Задача попадает ровно в один
  блок, приоритет planned → overdue → carry_over.
- `suggestions`: просроченные дедлайны, дедлайны в ближайшие 7 дней и `stale` — задачи без дат,
  которые не трогали дольше 14 дней (до 10 штук, старые сверху). Уже запланированное на `date` не предлагается.
- `/day/plan` одной транзакцией ставит `scheduled_for = date` задачам из `add` и снимает его у задач из
  `remove` (только если они стояли именно на `date`).

### Ошибки

| статус | коды                                                                                     |
|--------|------------------------------------------------------------------------------------------|
| 400    | `INVALID_ID`, `INVALID_DATE`, `INVALID_VIEW`, `INVALID_QUERY`, `INVALID_BODY`, `EMPTY_TITLE`, `TITLE_TOO_LONG`, `EMPTY_NAME`, `INVALID_COLOR`, `INVALID_PRIORITY`, `NOTHING_TO_UPDATE`, `NOT_DONE`, `SUBTASK_TOO_DEEP` |
| 401    | `UNAUTHORIZED`, `WRONG_PASSWORD`                                                         |
| 404    | `TASK_NOT_FOUND`, `PROJECT_NOT_FOUND`                                                    |
| 409    | `ALREADY_DONE`, `ALREADY_UNDONE`                                                         |
| 500    | `INTERNAL_SERVER_ERROR` (подробности только в логе сервера)                              |

`message` — по-английски для отладки; фронтенд показывает свой русский текст по `code`.

`GET /healthz` — проба живости для контейнера, базу не трогает.

## Фронтенд

- **Быстрый ввод** в списке: `докер для todo #todo !срочно 25.09` — `#имя` выбирает список (без учёта
  регистра, ё = е, пробелы и дефисы можно опустить, хватает начала имени, если оно однозначно — `#fin`;
  при наборе `#` под полем появляются подсказки списков), `!срочно` / `!важно` / `!обычно` — приоритет,
  `25.09`, `25.09.2027`, `завтра`, `пн`…`вс` — дедлайн. Распознанное показывается чипами под полем,
  нераспознанный `#тег` остаётся в заголовке.
- **Свайпы по строке**: влево — кнопка «удалить» (нажатие на неё — подтверждение), вправо — «на сегодня».
- **Выполненные** в списке и во входящих — свёрнутая секция «выполнено · N» внизу, галочка возвращает задачу.
- **Перетаскивание** за ручку справа, порядок сохраняется в БД через `/tasks/reorder`.
- Все «сегодня» считаются по локальной дате устройства и уходят в запросы параметром `today=`.
