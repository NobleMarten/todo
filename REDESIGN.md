# REDESIGN.md — задание для Claude Code

Репозиторий: `NobleMarten/todo` (Go + Postgres + React/Vite/TS, PWA, деплой на VPS).
Цель: перестроить приложение со схемы «одна плоская очередь задач + приоритет» на схему
«списки (проекты) + даты + подзадачи», с главным экраном «Сегодня».

Работаешь по этапам. **После каждого этапа — остановка и отчёт**, дальше только по команде.
Каждый этап = отдельная ветка от `main` или отдельный коммит, на выбор владельца репозитория.

---

## 0. Роли и рамки

- Весь код (бэкенд и фронтенд) пишешь ты. Владелец репозитория отдельно занимается Docker —
  **не трогай** `Dockerfile`, `docker-compose*.yml`, `deploy-frontend.sh`, systemd-юниты, конфиги nginx.
  Если нужна новая переменная окружения — добавь в `.env.example` и напиши об этом в отчёте.
- В базе лежат ~160 реальных задач, из них ~136 выполненных. **Данные не теряем.**
  Любая миграция — обратимая, колонки с данными не удаляем, а переименовываем.
- Стек не меняем и не расширяем без нужды: стандартная библиотека Go + `pgx/v5/stdlib`,
  React + Vite + TypeScript + framer-motion. Никаких chi/gin/echo, gorm/sqlx/ent, Redux, Tailwind, UI-китов.
  Разрешённые новые зависимости: `github.com/pressly/goose/v3` (бэкенд), `react-router-dom` (фронтенд).
- Язык интерфейса — русский, ярлыки в нижнем регистре (как сейчас). Комментарии в коде — русские,
  в том же стиле, что уже есть в репозитории.
- Каждый этап заканчивается зелёными `go build ./...`, `go vet ./...`, `go test ./...`,
  `npm run build` и `npm run lint` во `frontend/`. Не отчитывайся об успехе, не запустив это.

---

## 1. Что не так сейчас (чтобы не воспроизвести)

1. У задачи одна ось — `priority`. Учёба, Go, finance-tracker и быт лежат в одной очереди.
2. Дедлайнов нет: они вписаны прямо в заголовок («парс сайтов 04.10 дедлайн»).
3. `service.List()` тянет все задачи в память, там же фильтрует, сортирует и режет пагинацией.
   Фильтрация и сортировка должны уехать в SQL.
4. Порядок задач лежит в `localStorage` (`todo-manual-order`) — на айфоне и макбуке он разный.
   Порядок переезжает в БД, в колонку `position`.
5. Роутинг собран на `strings.TrimPrefix` / `strings.Split` внутри одного метода `Todos`.
   В проекте Go 1.25 — переходим на паттерны `ServeMux` (`mux.HandleFunc("GET /tasks/{id}", ...)`).
6. Миграции выполняются как `ALTER TABLE ... IF NOT EXISTS` в `NewPostgresRepo`, причём
   результат первого `Exec` затирается вторым и ошибка теряется. Переходим на `goose`.
7. `daily_date` отдаётся как `time.Time` в UTC-полночь, и фронтенд сравнивает даты через `.slice(0, 10)`.
   Все календарные даты должны быть отдельным типом, сериализуемым как `"YYYY-MM-DD"`.
8. Выполненные задачи лежат в той же выдаче, что и активные.

---

## 2. Целевая модель данных

Таймзона приложения — `Europe/Moscow`, вынести в переменную окружения `APP_TZ` (значение по умолчанию
`Europe/Moscow`). Все «сегодня/вчера» считаются в ней.

```sql
-- projects
id          SERIAL PRIMARY KEY
name        TEXT        NOT NULL
color       TEXT        NOT NULL DEFAULT '#6AA6FF'
position    INT         NOT NULL DEFAULT 0
archived    BOOLEAN     NOT NULL DEFAULT false
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()

-- tasks: существующие колонки (id, title, done, priority, created_at, done_at) остаются
project_id     INT  REFERENCES projects(id) ON DELETE SET NULL   -- NULL = «Входящие»
parent_id      INT  REFERENCES tasks(id)    ON DELETE CASCADE    -- подзадача; глубина ровно 1
due_date       DATE                                              -- дедлайн: «позже нельзя»
scheduled_for  DATE                                              -- день работы: «сажусь за неё тогда-то»
position       INT  NOT NULL DEFAULT 0
note           TEXT
```

Миграции — `goose`, каталог `migrations/`, по одному файлу на миграцию,
имя `NNNNN_name.sql`, внутри секции `-- +goose Up` и `-- +goose Down`:

1. `00001_projects.sql` — таблица `projects` + индексы.
2. `00002_tasks_fields.sql` — `ALTER TABLE tasks RENAME COLUMN daily TO scheduled_for`
   (данные «на сегодня» сохраняются), затем добавление `project_id`, `parent_id`, `due_date`,
   `position`, `note`. Заполнить `position` существующим задачам: `position = id`.
3. `00003_seed_projects.sql` — создать списки владельца:
   `Go` `#6AA6FF`, `Учёба` `#F5B851`, `Todo` `#7DE0D1`, `Finance-Tracker` `#4ADE80`,
   `Стажировка` `#C08BFF`, `Личное` `#6E6E85`. Существующие задачи **не** раскидывать —
   они остаются во «Входящих», владелец разложит их руками через интерфейс.
4. Индексы: `tasks(project_id)`, `tasks(parent_id)`, `tasks(scheduled_for)`, `tasks(due_date)`,
   частичный `tasks(done) WHERE done = false`.

Миграции применяются на старте `cmd/todo-api`, чтобы на VPS не требовался отдельный бинарник:

```go
//go:embed migrations/*.sql
var migrationsFS embed.FS

goose.SetBaseFS(migrationsFS)
if err := goose.SetDialect("postgres"); err != nil { ... }
if err := goose.Up(db, "migrations"); err != nil { ... }
```

Для этого `sql.Open` переезжает из `NewPostgresRepo` наружу: новая функция
`storage.NewDB(connStr) (*sql.DB, error)` открывает соединение и делает `Ping`,
`storage.Migrate(db)` прогоняет миграции, а `NewPostgresRepo(db *sql.DB)` получает готовый
`*sql.DB` и больше ничего не создаёт и не мигрирует. Старые `ALTER TABLE` из него убрать.
Каждая миграция идёт в транзакции (поведение goose по умолчанию) — `-- +goose NO TRANSACTION`
не использовать без явной причины.

### Типы в Go

```go
// internal/model/date.go
// Календарная дата без времени и таймзоны. JSON: "2026-10-04" или null.
// Реализует json.Marshaler/Unmarshaler и sql.Scanner/driver.Valuer.
type Date struct{ ... }
```

`Task` после переделки:

```go
type Task struct {
    ID           int        `json:"id"`
    Title        string     `json:"title"`
    Done         bool       `json:"done"`
    Priority     string     `json:"priority"`                 // high | medium | low
    ProjectID    *int       `json:"project_id"`
    ParentID     *int       `json:"parent_id"`
    DueDate      *Date      `json:"due_date"`
    ScheduledFor *Date      `json:"scheduled_for"`
    Position     int        `json:"position"`
    Note         *string    `json:"note"`
    CreatedAt    time.Time  `json:"created_at"`
    DoneAt       *time.Time `json:"done_at"`
    Subtasks     []Task     `json:"subtasks,omitempty"`       // заполняется только там, где заявлено ниже
    SubtaskStats *Stats     `json:"subtask_stats,omitempty"`  // {done, total}
}
```

**Приоритет остаётся, но больше не задаёт секции.** Теперь это только цвет кружка-чекбокса
и порядок сортировки внутри секции. Секции строятся из дат и списков.
Старой звёздочки «на сегодня» нет — её роль играет `scheduled_for = сегодня`.

---

## 3. API

Роутер — `http.ServeMux` с паттернами Go 1.22+. Старые `/todos*` не сохраняем: фронтенд
переписывается в этом же цикле. Префикс — `/tasks`, `/projects`, `/day`.

```
GET    /projects                 → [Project]  (archived=false по умолчанию, ?archived=true — все)
POST   /projects                 {name, color}                     → 201 Project
PATCH  /projects/{id}            {name?, color?, archived?}        → Project
DELETE /projects/{id}            → 204   (задачи получают project_id = NULL)
POST   /projects/reorder         {ids: [3,1,2]}                    → 204

GET    /tasks?view=...           → {items, total}
GET    /tasks/{id}               → Task с полем subtasks
POST   /tasks                    {title, priority?, project_id?, due_date?, scheduled_for?, parent_id?}
PATCH  /tasks/{id}               трёхзначная семантика, см. ниже   → Task
DELETE /tasks/{id}               → 204   (подзадачи удаляются каскадом)
POST   /tasks/reorder            {scope, ids}                      → 204

GET    /day?date=YYYY-MM-DD      → сборка экрана «Сегодня»
GET    /day/suggestions?date=    → материал для экрана «Собрать день»
POST   /day/plan                 {date, add: [id], remove: [id]}   → 204

GET    /stats/activity?from=&to= → [{date, done}]  (для грида активности)
POST   /tasks/clear              → 204  (оставить, с тем же двойным подтверждением на фронте)
```

### `GET /tasks` — вьюхи (фильтрация в SQL, не в памяти)

| `view`     | что возвращает                                                                  |
|------------|---------------------------------------------------------------------------------|
| `today`    | `done = false AND scheduled_for = :today`                                        |
| `week`     | `done = false AND (due_date BETWEEN :today AND :today + 7 OR scheduled_for BETWEEN :today AND :today + 7)` |
| `overdue`  | `done = false AND due_date < :today`                                             |
| `inbox`    | `done = false AND project_id IS NULL`                                            |
| `project`  | `done = false AND project_id = :project_id` (обязателен `project_id`)            |
| `all`      | `done = false`                                                                   |
| `archive`  | `done = true`, сортировка по `done_at DESC`, обязательна пагинация               |

Общие параметры: `project_id`, `done`, `from`, `to`, `limit`, `offset`,
`sort=position|due_date|priority|created_at`, `order=asc|desc`,
`today=YYYY-MM-DD` (локальная дата клиента; если не передана — текущая дата в `APP_TZ`).

Во всех вьюхах возвращаются **только корневые задачи** (`parent_id IS NULL`), каждая с
`subtask_stats`. Полный список подзадач отдаётся только в `GET /tasks/{id}`.
Сортировка по умолчанию: `position ASC, id ASC`.

### `PATCH /tasks/{id}` — три состояния поля

Отличать «поле не прислали» от «прислали null» обязательно: `{"due_date": null}` очищает дедлайн,
отсутствие ключа его не трогает. Сделать обобщённый тип:

```go
type Opt[T any] struct {
    Set   bool  // ключ присутствовал в JSON
    Value *T    // nil, если пришёл null
}
func (o *Opt[T]) UnmarshalJSON(b []byte) error { ... }
```

и собрать `UPDATE` динамически из присутствующих полей (по одному именованному аргументу на поле),
**не** через `COALESCE($1, title)` — на этом уже ломались: `COALESCE` не даёт отличить «не менять»
от «поставить null».

Правила сервиса при PATCH:
- `done: true` → `done_at = now()`; `done: false` → `done_at = NULL`.
- `parent_id` можно проставить только задаче без подзадач, и только на задачу, у которой
  `parent_id IS NULL` (глубина ровно 1). Иначе — 400 с кодом `SUBTASK_TOO_DEEP`.
- при смене `project_id` подзадачи переезжают вместе с родителем.
- `due_date` в прошлом разрешён (это нормальный просроченный дедлайн), но валидируем формат.

### `POST /tasks/reorder`

```json
{"scope": {"type": "project", "project_id": 5}, "ids": [12, 7, 3]}
{"scope": {"type": "day", "date": "2026-09-21"}, "ids": [12, 7]}
{"scope": {"type": "inbox"}, "ids": [4, 9]}
```
Одна транзакция, `position` присваивается по индексу в массиве. Идентификаторы не из области видимости
scope — игнорируются, в ответ 204.

### `GET /day?date=`

```json
{
  "date": "2026-09-21",
  "planned":    [Task],   // scheduled_for = date, done = false
  "overdue":    [Task],   // due_date < date, done = false
  "carry_over": [Task],   // scheduled_for < date, done = false — «вчера не доделал»
  "done_today": [Task],   // done_at попадает в date в APP_TZ
  "counts": {"planned": 4, "done": 2, "overdue": 1}
}
```

### `GET /day/suggestions?date=`

```json
{
  "overdue":  [Task],   // просроченные дедлайны
  "due_soon": [Task],   // due_date в пределах 7 дней
  "stale":    [Task]    // без дат, не менялись дольше 14 дней, сверху — самые старые, максимум 10
}
```
Задачи, уже запланированные на `date`, во все три списка не попадают.

### Ошибки

Сохранить текущий формат `{"code": "...", "message": "..."}` и централизованный `WriteError`.
Добавить коды: `PROJECT_NOT_FOUND`, `SUBTASK_TOO_DEEP`, `INVALID_DATE`, `INVALID_VIEW`.
Новые доменные ошибки — в `internal/model/errors.go`, рядом с существующими.

---

## 4. Структура бэкенда

```
cmd/todo-api/main.go          роутер на ServeMux с паттернами, CORS, graceful shutdown (как сейчас)
migrations/                   NNNNN_name.sql для goose, встраиваются через embed
internal/
  model/      task.go  project.go  date.go  opt.go  errors.go
  storage/    db.go (NewDB, Migrate)  repo.go (интерфейсы)
              postgres_tasks.go  postgres_projects.go  fake_repo.go
  service/    task_service.go  project_service.go  day_service.go
  transport/  router.go  tasks_handler.go  projects_handler.go  day_handler.go
              query_helpers.go  errors_helpers.go
```

- `internal/storage/file_repo.go`, `file_storage.go`, `old_cod/`, `data/tasks.json` и
  `cmd/todo-cli` переносим в каталог `_legacy/` (каталоги с подчёркиванием Go игнорирует),
  чтобы не тащить проекты и подзадачи в файловое хранилище. В отчёте отметить, что CLI
  потом при желании переписывается тонким HTTP-клиентом.
- `FakeRepo` в `internal/storage` реализует новый интерфейс и используется в тестах сервиса и хендлеров.
- Тесты репозитория против настоящего Postgres — только если задана `TEST_DB_URL`,
  иначе `t.Skip`. Существующие `service_test.go` и `handler_test.go` переписать под новые контракты,
  не выбрасывая покрытые ими кейсы (валидация title, already done/undone, 400/404, пагинация).

---

## 5. Фронтенд

```
frontend/src/
  api/         client.ts  tasks.ts  projects.ts  day.ts  types.ts
  hooks/       useTasks.ts  useProjects.ts  useDay.ts  useTheme.ts
  lib/         date.ts  quickAdd.ts  format.ts
  components/  TabBar.tsx  ScreenHeader.tsx  TaskRow.tsx  SubtaskRow.tsx
               TaskSheet.tsx  QuickAdd.tsx  ProjectRow.tsx  ProjectPicker.tsx  DatePicker.tsx
  screens/     TodayScreen.tsx  PlanDayScreen.tsx  ListsScreen.tsx
               ProjectScreen.tsx  ArchiveScreen.tsx
  theme.css    токены
  index.css    компоненты
```

Роутинг — `react-router-dom`:

| маршрут              | экран                                                       |
|----------------------|-------------------------------------------------------------|
| `/` → `/today`       | **TodayScreen** — экран по умолчанию                         |
| `/plan`              | PlanDayScreen — «Собрать день»                               |
| `/lists`             | ListsScreen — смарт-виды + списки                            |
| `/lists/:id`         | ProjectScreen (`id` = число, либо `inbox` / `all` / `week` / `overdue`) |
| `/task/:id`          | TaskSheet — карточка задачи (шит поверх текущего экрана)     |
| `/archive`           | ArchiveScreen — выполненные + грид активности                |

Нижний таб-бар из четырёх пунктов: `сегодня` · `неделя` (пока ведёт на `/lists/week`) ·
`списки` · `итоги` (`/archive`).

### Экраны

**TodayScreen** (макет `A1_Segodnya`). Дата и прогресс `2 / 6` сверху. Карточка «фокус дня» —
первая задача в `planned`. Блок «просрочено» (красная рамка) с кнопкой «перенести на сегодня» для
`carry_over`. Секция «план на день». Свёрнутый блок «готово · N» из `done_today`.
Если `planned` пуст — пустое состояние с кнопкой «собрать день» на `/plan`.

**PlanDayScreen** (макет `A2_Plan`). Три секции из `/day/suggestions`: «просрочено»,
«дедлайн на этой неделе», «из списков» (с подписью, сколько дней не трогали). У каждой строки
круглая кнопка: `+` → добавить, галочка → убрать. Внизу кнопка «начать день · N задач»,
она шлёт один `POST /day/plan` и уводит на `/today`.

**ListsScreen** (макет `B1_Spiski`). Сетка 2×2 смарт-видов: Сегодня, 7 дней, Просрочено (красный,
скрывать при нуле), Все задачи. Ниже — список проектов: цветная точка, название, красный бейдж
просроченных, счётчик активных. Строка «новый список» с пунктирной рамкой.

**ProjectScreen** (макет `B2_Proekt`). Шапка: назад, цветная точка, имя, меню (переименовать,
цвет, архивировать, удалить). Полоса прогресса «N / M за неделю». Чипы режима группировки:
`по датам` (по умолчанию) / `по приоритету`. Секции при группировке по датам: `просрочено`,
`сегодня`, `на этой неделе`, `позже`, `без даты`. Разворачивание задачи показывает подзадачи
с прогрессом `1/3` и строкой «+ подзадача». Внизу — поле быстрого добавления в этот список.
Чип `доска` из макета в этом цикле **не делаем** — добавить как заглушку нельзя, просто не рисуем.

**TaskSheet** (макет `C2_Karta`). Заголовок редактируется по месту. Чип списка (открывает
ProjectPicker), сегмент приоритета. Два отдельных поля дат, именно с этими подписями:
«дедлайн — когда нельзя позже» и «делаю — когда сажусь за неё». Подзадачи с прогрессом,
заметка, кнопки «выполнено» и удалить.

**ArchiveScreen**. Выполненные с пагинацией (`view=archive`) плюс существующий грид активности
из `components/Activity.tsx` и `hooks/useActivity.ts` — перенести, переведя на `/stats/activity`,
а не на выкачивание всех задач.

### Взаимодействия

- Порядок задач — перетаскивание на `framer-motion` `Reorder` (как сейчас), но результат уходит
  в `POST /tasks/reorder`. `localStorage`-ключ `todo-manual-order` удалить вместе с кодом чтения.
- Свайп по строке (`drag="x"` у framer-motion): влево — удалить с подтверждением,
  вправо — «на сегодня» (`scheduled_for = сегодня`). Кнопки удаления из каждой строки убрать,
  оставить в карточке задачи.
- Быстрый ввод: строка `докер для todo #todo !срочно 25.09` разбирается в `lib/quickAdd.ts`:
  `#имя` → список (совпадение без учёта регистра), `!срочно|!важно|!обычно` → приоритет,
  `ДД.ММ` или `завтра|пн|вт|…` → `due_date`. Разобранные куски показываются чипами под полем
  до отправки. Нераспознанный `#тег` остаётся частью заголовка.
- Оптимистичные обновления оставить, как в текущем `useTodos`, включая откат при ошибке.
- Все календарные вычисления — по локальной дате устройства; в запросы всегда подставляется
  `today=YYYY-MM-DD`, посчитанный на клиенте.

### Дизайн-токены (тёмная тема — основная)

```css
--bg: #0B0B0F;          --surface: #15151A;      --surface-2: #0F0F13;
--border: rgba(255,255,255,.07);                 --border-strong: rgba(255,255,255,.14);
--text: #EDEDF2;        --text-dim: #C9C9D8;     --muted: #9A9AB0;    --faint: #6E6E85;
--accent: #6AA6FF;      --danger: #FF8B7D;       --warn: #F5B851;     --ok: #4ADE80;
--radius-row: 14px;     --radius-card: 16px;     --radius-ctl: 10px;
--sans: 'Geist';        --mono: 'JetBrains Mono';
```

- Моноширинный шрифт — только для цифр, счётчиков, дат и ярлыков секций (верхний регистр,
  `letter-spacing: .1em`, 10.5px). Весь остальной текст — Geist.
- Цвет приоритета живёт в обводке круглого чекбокса: `срочно` → `--danger`,
  `важно` → `--warn`, `обычно` → `--faint`. Цветных полос слева у строк больше нет.
- Цель по касаниям: минимум 44×44 px у любой кнопки, строка задачи — не меньше 56 px.
- Светлую тему сохранить: те же токены с переопределением в `[data-theme='light']`,
  переключатель темы остаётся.
- Зерно (`.grain`), логотип `[todo]` и нижний регистр ярлыков оставить — это характер приложения.

---

## 6. Этапы

**Этап 1 — миграции и модель.**
`goose` c `embed`, каталог `migrations/`, `storage.NewDB` / `storage.Migrate`,
типы `model.Date`, `model.Opt[T]`, `model.Project`, обновлённый `model.Task`.
`NewPostgresRepo` больше не открывает соединение и не выполняет ALTER.
Приёмка: `go build ./...`, `go test ./...`; на локальной базе `goose up` и `goose down`
отрабатывают начисто; после `up` старые данные «на сегодня» видны в `scheduled_for`;
повторный запуск сервиса на уже мигрированной базе не падает.

**Этап 2 — бэкенд.**
Репозитории, сервисы, хендлеры, роутер на паттернах, все эндпоинты из раздела 3, `_legacy/`.
Тесты: сервис на `FakeRepo`, хендлеры через `httptest`, плюс тесты разбора `Opt[T]` и `Date`.
Приёмка: `go vet`, `go test`, и curl-сценарий в отчёте: создать проект → создать задачу с
дедлайном → назначить на сегодня → `GET /day` → перенести → выполнить.

**Этап 3 — фронтенд, каркас и вариант Б.**
Роутер, токены, `TabBar`, `api/*`, `useProjects`/`useTasks`, экраны `ListsScreen`, `ProjectScreen`,
`TaskSheet`, перетаскивание через `/tasks/reorder`. `TodayScreen` пока редиректит на `/lists`.
Приёмка: `npm run build`, `npm run lint`, ручной прогон на ширине 390 px.

**Этап 4 — вариант А.**
`TodayScreen`, `PlanDayScreen`, `ArchiveScreen`, перенос активности на `/stats/activity`,
`/today` становится экраном по умолчанию.

**Этап 5 — полировка.**
Свайпы, быстрый ввод, пустые состояния, скелетоны, состояния ошибок, проверка на iPhone
(Safari, режим PWA), README с новым API.

---

## 7. Чего не делать

- Не добавлять авторизацию, пользователей, шаринг, уведомления, Service Worker, офлайн-очередь.
  HTTPS на этом домене не настроен, всё, что его требует, вне объёма работ.
- Не реализовывать вариант «Неделя» (недельная полоса с перетаскиванием задач на дни) —
  он будет отдельной задачей позже. Поля `due_date` и `scheduled_for` уже заложены под него,
  этого достаточно.
- Не делать режим «доска» в проекте, повторяющиеся задачи, теги, вложения, поиск по всем полям.
- Не переписывать то, что работает: `useTheme`, `icons.tsx`, грид активности, формат ошибок,
  graceful shutdown, CORS-мидлварь.
- Не оставлять в коде заглушек и кнопок, которые ничего не делают.

---

## 8. Формат отчёта после этапа

1. Что сделано, файлами: добавлено / изменено / перенесено.
2. Команды, которые ты реально запустил, и их результат.
3. Решения, принятые за владельца, и их альтернативы.
4. Что осталось и чем рискуем на проде (особенно по миграциям).

Последним действием этапа — дописать блок в «Журнал» внизу этого файла и закоммитить его
вместе с кодом. Следующий этап делается с чистого контекста, и журнал — единственное,
что о предыдущем этапе известно.

---

## 9. Журнал

Формат блока:

```
### Этап N — <название> · <дата> · <ветка/коммит>
Сделано: ...
Отклонения от спеки и почему: ...
Долги, которые тянутся дальше: ...
```

<!-- дальше дописывает агент, по блоку на этап -->

### Этап 1 — миграции и модель · 2026-09-24 · ветка `redesign/stage-1`
Сделано:
- goose v3.28 (глобальный API, как в спеке). Миграции в `migrations/`, встроены через пакет
  `migrations` (`migrations/embed.go`, `FS embed.FS`): `//go:embed` не видит `../`, поэтому FS живёт рядом с SQL.
  `00001_projects` (таблица + индекс `(archived, position)`), `00002_tasks_fields` (daily → scheduled_for,
  новые колонки, `position = id`), `00003_seed_projects` (6 списков, задачи не раскладываются),
  `00004_tasks_indexes` (индексы из п. 4 раздела 2 — отдельным файлом).
- `storage.NewDB` (Open + PingContext с таймаутом 5 с), `storage.Migrate` (goose Up по встроенному FS).
  `cmd/todo-api` делает NewDB → Migrate → `NewPostgresRepo(db)`, на выходе `db.Close()`.
- `NewPostgresRepo(db *sql.DB)` ничего не открывает и не мигрирует; ALTER-ы удалены. Все запросы отдают новые
  колонки через `taskColumns` + `scanTask`. Методы и их поведение прежние, включая старый PATCH `daily: bool`,
  который теперь пишет в `scheduled_for` (Europe/Moscow пока зашита). В `List` добавлены `rows.Close()`/`rows.Err()`.
- `model.Date` (`{Year, Month, Day}`, JSON/БД `"YYYY-MM-DD"`, нулевое = null; `ParseDate`, `DateOf`, `Today(loc)`,
  `AddDays`, `Before/After`), `model.Opt[T]`, `model.Project`, `model.Stats`, новый `model.Task`,
  `model.ErrInvalidDate`. `FakeRepo`/`FileRepo` минимально переведены с `DailyDate` на `ScheduledFor`.
- Тесты: `internal/model/date_test.go`, `opt_test.go`; `internal/storage/migrate_test.go` — только при `TEST_DB_URL`,
  в одноразовой схеме через `search_path`: legacy-данные → up → up (no-op) → down-to 0 → up; плюс пустая база.
- Проверено на локальной базе со схемой из `db/init.sql`: goose CLI up / down-to 0 / up начисто, `daily` → `scheduled_for`
  сохраняется, сервис дважды стартует на мигрированной базе и сам мигрирует базу с версии 0.

Отклонения от спеки и почему:
- `00002` начинается с идемпотентной базовой схемы (`CREATE TABLE IF NOT EXISTS tasks`, `ADD COLUMN IF NOT EXISTS
  priority/daily`): до goose таблицу создавал только `db/init.sql`, а без этого миграции падают на пустой базе.
- Индексы tasks — отдельная миграция `00004`: в спеке 4 пункта, но только 3 имени файлов.
- `go.mod`: директива `go 1.25.5` → `go 1.26.0`, pgx 5.8 → 5.10 — этого требует goose v3.28. Dockerfile уже на golang:1.26.
- JSON задачи: `daily_date` больше нет (теперь `scheduled_for`), у `done_at` убран `omitempty` — по спеке.

Долги, которые тянутся дальше:
- **Не деплоить ветку до Этапа 3**: текущий фронт читает `daily_date`, секция «на сегодня» опустеет.
- Порядок отката на проде: сначала `goose down-to 0` (новым бинарником или goose CLI), потом старый бинарник.
  Если сначала запустить старый — он создаст пустую `daily` через `ADD COLUMN IF NOT EXISTS`,
  и Down упадёт на `RENAME scheduled_for TO daily`. Перед первым деплоем — `pg_dump`.
- На VPS проверить, что пользователь из `DB_URL` владеет `tasks` и имеет CREATE в схеме `public`
  (PG15+ не даёт его PUBLIC): иначе `Migrate` падает и контейнер уходит в crash-loop.
- Этап 2: `APP_TZ` (сейчас `Europe/Moscow` зашита в `PostgresRepo.Patch`), маппинг `INVALID_DATE` и других новых кодов
  в `WriteError`, `position` для новых задач при `Create` (сейчас 0 → встанут выше старых).
- goose через глобальное состояние, без контекста и advisory-lock — по спеке и при одной реплике допустимо;
  при желании перейти на `goose.NewProvider` + `WithSessionLocker`.
- `Date.Scan` не понимает `infinity`/`-infinity` — API такое не пишет, риск только при ручной правке базы.
- Down `00003` удаляет списки по имени: пользовательский список с тем же именем тоже удалится при `down-to 2`.
- Комментарий в `db/init.sql` про ALTER в `NewPostgresRepo` устарел — файл в зоне Docker, не трогал.
- `FakeRepo`/`FileRepo`: `daily=false` ставит сегодняшнюю дату вместо очистки (было так и в main).


### Этап 2 — бэкенд · 2026-09-24 · ветка `redesign/stage-1`, коммит «этап 2: …»
Сделано:
- Все эндпоинты раздела 3 на `http.ServeMux` с паттернами (`internal/transport/router.go`), `/todos*` удалены.
  Хендлеры: `tasks_handler.go`, `projects_handler.go`, `day_handler.go` (там же `/stats/activity`). Ошибки — таблица
  `errorCodes` в `errors_helpers.go`, добавлены `PROJECT_NOT_FOUND`, `SUBTASK_TOO_DEEP`, `INVALID_DATE`, `INVALID_VIEW`,
  а также `INVALID_QUERY`, `INVALID_BODY`, `INVALID_PRIORITY`, `EMPTY_NAME`, `INVALID_COLOR`, `TITLE_TOO_LONG` (раньше давал 500).
- `storage/repo.go`: `TaskRepo`, `ProjectRepo`, `TaskFilter` (набор условий через AND), `TaskQuery`, `TaskPatch` (Opt).
  Вьюхи и блоки `/day` собираются из условий в сервисе, SQL — в `filterConds`/`orderBy` (`postgres_tasks.go`).
  `PostgresRepo` реализует оба интерфейса на `pgx.NamedArgs`; PATCH — динамический `UPDATE` без `COALESCE`, в транзакции
  с переносом подзадач в новый список. Reorder — один `UPDATE … FROM unnest(@ids) WITH ORDINALITY`, position = индекс с 0.
- `FakeRepo` (`fake_repo.go`) повторяет семантику SQL; `repo_contract_test.go` гоняет один сценарий на фейке всегда
  и на Postgres при `TEST_DB_URL` — это гарантия, что тесты сервиса на фейке значат то же, что и прод.
- Сервисы: `task_service.go`, `project_service.go`, `day_service.go`. Конструкторы получают `*time.Location` из `APP_TZ`
  (`config.Config.Loc`, по умолчанию `Europe/Moscow`, `Local` запрещён — имя зоны уходит в Postgres).
- Миграции: `00005_tasks_updated_at` (колонка для «не трогали 14 дней», backfill `COALESCE(done_at, created_at)`,
  обновляется PATCH-ем и `/day/plan`, reorder — нет); `00006_tasks_priority_not_null` (на живой базе priority была nullable).
- В `_legacy/` (git mv): `cmd/todo-cli`, `storage/file_repo.go`, `storage/file_storage.go`, `old_cod/`, `data/tasks.json`.
  CLI там не компилируется (ссылается на удалённое) — при желании переписать тонким HTTP-клиентом.
- Тесты: сервисы на `FakeRepo`, хендлеры через `httptest` на настоящем роутере, контракт репозитория, миграции
  (включая NULL priority). Прогон `TEST_DB_URL=… go test ./...` и curl-сценарий из приёмки — на одноразовой базе, зелёные.

Отклонения от спеки и решения за владельца:
- `/day`: задача попадает ровно в один блок, приоритет planned → overdue → carry_over.
- Во всех выдачах, кроме `GET /tasks/{id}`, только корневые задачи; `done_today`, `counts.done` и `/stats/activity`
  тоже считают только корневые (чтобы грид и «готово · N» не расходились).
- `PATCH done:true` на выполненной — 409 `ALREADY_DONE` (как раньше), весь PATCH отклоняется.
- Подзадача: при создании/привязке получает `project_id` родителя; сменить `project_id` у подзадачи без `parent_id`
  в том же PATCH — 400 `INVALID_BODY`. Родителя нет — 404 `TASK_NOT_FOUND` с «parent N» в message.
- `GET /tasks`: без `view` = `all`; `done=` переопределяет условие вьюхи; `from`/`to` только парой, фильтруют `done_at`
  в `archive` и `created_at` в остальных; `archive` — лимит по умолчанию 50, максимум 200; `offset` работает и без `limit`;
  допустимые `sort` — `position|due_date|priority|created_at|done_at`, пустые даты всегда в конце.
- Ответ `GET /tasks/{id}` всегда содержит `subtasks` (хотя бы `[]`) — отдельный `TaskDetailResponse`.
- `GET /projects` отдаёт `counts: {active, overdue}` (корневые невыполненные; принимает `?today=`).
- Новые задачи и списки получают `MAX(position)+1` — встают в конец.
- `/stats/activity` без параметров — последние 365 дней до сегодня в APP_TZ, ответ разреженный (только дни с done > 0).
- id > MaxInt32 отбиваются в сервисе как 400/404, а не 500 от Postgres.

Долги, которые тянутся дальше:
- **Dockerfile не копирует `migrations/`** (с Этапа 1): `docker build` бэкенда падает на импорте `todo/migrations`.
  Нужна строка `COPY migrations ./migrations` — зона владельца, не трогал.
- `frontend/nginx.conf` проксирует только `/todos`: к Этапу 3 нужны `location` для `/tasks`, `/projects`, `/day`, `/stats`.
- `compose.yml` не передаёт `APP_TZ` в backend (сработает дефолт `Europe/Moscow`) — добавить при желании.
- Текущий фронт после этапа не работает (API `/todos` удалён) — не деплоить до Этапа 3.
- `position` одна на все scope: reorder в «дне» меняет порядок и в проекте, и наоборот (следствие спеки;
  для «Недели» может понадобиться отдельная `day_position`). Подзадачи переставлять нечем — scope `parent` не заведён.
- Правило глубины подзадач — check-then-act без блокировки; при одном пользователе гонки нереальны.
- Подзадачам можно поставить `due_date`/`scheduled_for`, но ни одна вьюха их не покажет, `/day/plan` их пропускает.
- `CLAUDE.md` устарел (роутинг, `FileRepo`, CLI, `daily`) — обновить вместе с README на Этапе 5.
- Мелочи: 404/405 самого ServeMux — plain text; имя списка > 60 символов даёт код `TITLE_TOO_LONG`;
  `model.ErrNotAllowed` больше не используется; переполнение тела (1 МБ) — 400, а не 413.
- Откат на проде: `goose down-to 0` теперь проходит 6 миграций; `00006` Down не возвращает исправленные NULL priority.

### Этап 3 — фронтенд, каркас и вариант Б · 2026-09-24 · ветка `redesign/stage-1`, коммит «этап 3: …»
Сделано:
- `react-router-dom` 7: `/` → `/today` (пока `<Navigate to="/lists">`), `/lists`, `/lists/:id`, `/task/:id` — шит поверх
  экрана из `location.state.background` (прямая ссылка — поверх «Списков»; из карточки в карточку — `replace`).
  `:id` = число или `inbox|all|today|week|overdue`; неизвестный/удалённый список → `/lists`.
- `api/` (`client.ts` с `ApiError{status, code}`, `tasks.ts`, `projects.ts`, `day.ts` — пока только `planDay`, `types.ts`),
  `lib/date.ts` (строковые `YYYY-MM-DD` по локальной дате, `today=` уходит в каждый GET), `lib/format.ts` (приоритеты,
  секции, склонения; `dateKey/localDayOf/pluralTasks` сохранены для `Activity.tsx`), `lib/sync.ts` — шина
  «данные изменились»: после мутации остальные хуки тихо перечитываются.
- `hooks/useTasks.ts`: `useTasks(spec)` (оптимистично с откатом, выполненная/ушедшая из вида задача пропадает после
  ответа сервера, reorder), `useTask(id)` (карточка и раскрытая строка), `useSmartCounts` (total с `limit=1`),
  `useWeekProgress`. `hooks/useProjects.ts` — активные + архивные, CRUD, reorder.
- Компоненты: `TabBar`, `ScreenHeader`, `TaskRow`, `SubtaskRow`/`SubtaskList`, `TaskSheet`, `Sheet`, `QuickAdd`,
  `ProjectRow`, `ProjectPicker` (+ `ColorSwatches`), `DatePicker`. Экраны `ListsScreen`, `ProjectScreen`, `TodayScreen`.
- `theme.css` — токены раздела 5 + светлая тема; `index.css` переписан, блок грида активности сохранён (имена токенов
  обновлены). Удалены `api.ts`, `useTodos.ts` (с `todo-manual-order`), `lists.tsx`, `TodoRow.tsx`, `AddForm.tsx`, `Filters.tsx`.
- Проверено: `npm run build`, `npm run lint`, разовый `tsc --strict --noEmit` через npx (без зависимостей в проекте),
  Go-приёмка; ручной прогон на 390×844 — headless Chrome через playwright-core из scratchpad (расширение Chrome
  не подключилось) против локального API на одноразовой базе: все экраны, drag (порядок в БД), выполнение, подзадачи,
  быстрый ввод, меню списка (переименовать/архив/вернуть/удалить), удаление задачи, прямая ссылка, светлая тема;
  горизонтального переполнения и ошибок в консоли нет (кроме ожидаемых 404 на удалённый/несуществующий список).

Отклонения от спеки и решения за владельца:
- Таб «итоги» не рисуется до Этапа 4 (раздел 7: без пустых кнопок). В таб-баре три пункта.
- Смарт-карточка «сегодня» ведёт на `/lists/today` (вьюха `today`) — `/today` пока редиректит на `/lists`.
- Группировка «по датам»: `due_date < сегодня` → «просрочено»; иначе ближайшая из `scheduled_for`/`due_date`,
  причём `scheduled_for` в прошлом считается «сегодня»; «на этой неделе» — до +7 дней.
- Внутри секции по датам — сортировка по приоритету, потом `position`; перетаскивание только внутри отрезка
  одного приоритета (иначе строка отскакивала бы). По приоритету — вся секция. На сервер уходит полный порядок вида.
  Drag есть только в списке и «входящих» (у `all/week/overdue/today` нет scope).
- «N / M за неделю»: N — выполнено за последние 7 дней (`view=archive&from&to`, total), M = N + активные; только у списков.
- Быстрый ввод: только заголовок; в `today` ставит `scheduled_for = сегодня`, в `all` — во «входящие»,
  в `week/overdue` поля нет. Разбор `#/!/дат` — Этап 5.
- Архивные списки — свёрнутая секция «в архиве · N» с кнопкой «вернуть» (иначе их не достать).
- Меню списка — шит (имя, цвет, в архив, удалить с подтверждением); палитра — 6 цветов сидов + `#FF8B7D`.
- `tsconfig`/`typescript`/`typescript-eslint` не добавлены: `npm run lint` по-прежнему не видит `.tsx`.

Долги, которые тянутся дальше:
- `hooks/useActivity.ts` импортирует удалённый `../api` — файл мёртвый до Этапа 4 (сборку не ломает: его никто
  не импортирует). На Этапе 4 переписать на `/stats/activity`.
- Деплой: нужен `frontend/nginx.conf` с `/tasks|/projects|/day|/stats` и `COPY migrations` в Dockerfile (см. Этап 2,
  `OWNER_TODO.md`) — без этого фронт на проде не заработает.
- Заголовок/заметка в карточке растут через `field-sizing: content` (Chrome 123+, Safari 26+); в старом Safari
  заголовок — одна строка с прокруткой. Проверить на iPhone на Этапе 5.
- Шина `lib/sync.ts` перечитывает все подписанные хуки после любой мутации: при ~160 задачах дёшево, но это
  N лишних GET; после удаления списка его экран успевает один раз получить 404 (тихо).
- Смена списка у подзадачи из карточки не предлагается (следует за родителем) — по спеке.
- `CLAUDE.md` описывает старый фронт (`useTodos`, localStorage-порядок, `daily`) — обновить на Этапе 5.
