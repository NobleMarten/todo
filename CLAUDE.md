# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Go, module `todo`)

```bash
go run ./cmd/todo-api            # HTTP API (needs DB_URL; applies goose migrations on start)
go build ./... && go vet ./... && go test ./...
go test ./internal/service -run TestPatch -v                  # single test
TEST_DB_URL=postgres://... go test ./internal/storage         # repo contract + migration tests against real Postgres
```

Config comes from env (`internal/config`): `godotenv` loads `.envlocal`, falling back to `.env` (both gitignored; see `.env.example`). `DB_URL` is required. `PORT` defaults to 8080, `HTTP_SHUTDOWN_TIMEOUT` to 10s, `APP_TZ` to `Europe/Moscow` (all "today"/overdue/day boundaries on the server are computed in it; `Local` is rejected because the zone name is passed to Postgres).

### Frontend (`frontend/`, React 19 + Vite + react-router-dom 7 + framer-motion)

```bash
npm run dev        # dev server
npm run build      # tsc -p . (type check) && vite build -> frontend/dist
npm run typecheck  # tsc only
npm run lint       # eslint: .js via @eslint/js, .ts/.tsx via typescript-eslint
npm test           # vitest run (npx vitest run src/lib/quickAdd.test.ts -t 'parseQuickAdd' — single file/test)
```

Tests are plain-function unit tests next to the code (`src/**/*.test.ts`, node environment, no jsdom): `lib/date`, `lib/quickAdd`, `lib/format`, `api/client`. `vitest.config.js` pins `TZ=Europe/Berlin` (a DST zone, so local-vs-UTC date bugs show up) and blanks `VITE_API_URL` so `frontend/.env` never leaks into tests.

`VITE_API_URL` in `frontend/.env` points at the backend — set `http://localhost:8080` when developing against a local API. Empty = relative requests (same-origin nginx proxy).

## Architecture

`REDESIGN.md` is the spec for the current design (lists + dates + subtasks, "Today" as the home screen); its section 9 "Журнал" records what each stage did and the open debts. `README.md` documents the API.

```
transport (ServeMux patterns)  ->  service (tasks / projects / day)  ->  storage (TaskRepo, ProjectRepo)  ->  model
```

- **Routing** is `http.ServeMux` with Go 1.22+ patterns in `internal/transport/router.go` (`GET /tasks/{id}` etc.). Prefixes: `/tasks`, `/projects`, `/day`, `/stats`, `/auth`, plus `/healthz`. New endpoints go under an existing prefix when possible — every new prefix also needs a line in `frontend/nginx.conf` (owner's zone).
- **Storage**: `storage/repo.go` defines `TaskRepo`/`ProjectRepo`, `TaskFilter` (AND-ed conditions), `TaskQuery`, `TaskPatch`. `PostgresRepo` builds SQL from the filter (`filterConds`/`orderBy` in `postgres_tasks.go`) using `pgx.NamedArgs` — **filtering, sorting and pagination happen in SQL**. `FakeRepo` mirrors the SQL semantics for service/handler tests; `repo_contract_test.go` runs the same scenario on both, so **a repo change must be made in `PostgresRepo` and `FakeRepo` together**.
- **Views** (`today|week|overdue|inbox|project|all|archive`) and the `/day` blocks are assembled from filter conditions in the services. All list outputs return only root tasks (`parent_id IS NULL`) with `subtask_stats`; subtasks come only from `GET /tasks/{id}`.
- **PATCH is tri-state**: `model.Opt[T]` distinguishes "key absent" from `null`, and `PostgresRepo` builds a dynamic `UPDATE` from present fields. Never use `COALESCE($1, col)` for patches.
- **Dates**: `model.Date` is a calendar date serialized as `"YYYY-MM-DD"` (JSON and SQL). `due_date` = deadline, `scheduled_for` = the day you work on it (it replaced the old `daily` column).
- **Repeat**: `tasks.repeat` (migration 00007) holds a `model.Repeat` string (`daily|weekdays|weekly:1,4|monthly:15`), canonicalized by the service. `TaskService.Patch` with `done: true` on a repeating root task clears the rule on it and `spawnNext` creates the next copy (`nextDates`: shift both dates to the next matching day, never before today); if creating fails, the completion is rolled back. Frontend mirror: `lib/repeat.ts`.
- **Order** lives in the DB (`position`), one column shared by all reorder scopes (`project`, `inbox`, `day`).
- **Migrations**: goose, `migrations/NNNNN_name.sql`, embedded via the `migrations` package (`migrations/embed.go`) and applied by `storage.Migrate` at API start. Every migration must be reversible; data columns are renamed, never dropped. `NewPostgresRepo(db)` does not open connections or migrate.
- **Errors**: sentinels in `internal/model/errors.go`; `transport.WriteError` maps them via the `errorCodes` table to status + `{code, message}`; unknown errors are logged and returned as 500.

### Frontend

- `App.tsx` holds routes: `/today` (default), `/plan`, `/week` (`?from=&day=`; tab «неделя»), `/lists`, `/lists/:id` (number or `inbox|all|today|week|overdue`), `/archive`, and `/task/:id` — a sheet rendered over the screen stored in `location.state.background`.
- `api/` — `client.ts` (`request`, `ApiError{status, code}`, `errorText` maps API codes to Russian UI text), `tasks.ts`, `projects.ts`, `day.ts`, `types.ts`.
- `hooks/useTasks.ts` (`useTasks`, `useTask`, `useArchive`, counters), `useDay.ts`, `useProjects.ts`, `useActivity.ts`: optimistic mutations with rollback; `lib/sync.ts` is a "data changed" bus — after a mutation every other subscribed hook silently refetches.
- `lib/date.ts` does all calendar math on local `YYYY-MM-DD` strings (never through UTC `Date` parsing), and every GET sends the client's `today=`. `lib/format.ts` holds priorities, sections, pluralization. `lib/quickAdd.ts` parses quick-add input (`#list`, `!срочно|!важно|!обычно`, `ДД.ММ`/`завтра`/`пн…вс` → due date, the same with `@` or `@сегодня` → `scheduled_for`).
- `components/SwipeRow.tsx`: swipe left reveals "удалить", right = "на сегодня". The drag is started manually via `dragControls` because framer-motion refuses to start a drag on a child `<button>`; the reorder grip (`TaskRow.Grip`) uses a native `pointerdown` listener with `stopPropagation` so it never starts the swipe.
- **Delete with undo**: hooks call `lib/pendingDelete.scheduleDelete` (hide now, `DELETE` after 5 s, flushed on `visibilitychange: hidden` or the next delete). Hidden ids live in `lib/deleting.ts` and are filtered inside `api/tasks.ts`/`api/day.ts`, so background refetches don't resurrect them; undo = unhide + `notifyChanged()`. `UndoToast` is mounted once in `App`.
- Skeletons (`Skeleton.tsx`), `ErrorState.tsx` for failed first loads, `error-bar` for failed actions, `ErrorBoundary.tsx` around the app.
- Styles: `theme.css` = tokens (dark default, `[data-theme='light']` overrides), `index.css` = components. UI strings are Russian, labels lowercase.

## Gotchas

- `frontend/tsconfig.json` is check-only (`noEmit`, strict, `noUnused*`, `verbatimModuleSyntax` — use `import type` for types); Vite/esbuild still transpiles without type info. TypeScript is pinned to `~5.9` because `typescript-eslint` 8 does not support TS 6/7.
- ESLint runs the React Compiler rules from `eslint-plugin-react-hooks` 7. `react-hooks/set-state-in-effect` is off for `.ts/.tsx` (every data hook loads in an effect by design); "latest ref" values are written in `useLayoutEffect`, not during render; files in `components/` export only components (`useOpenTask` lives in `hooks/`, `hidesTabBar` in `lib/nav.ts`) for fast refresh.
- `db/init.sql` still creates the pre-redesign `tasks` table for empty volumes; migration `00002` starts with an idempotent base schema so goose also works on a completely empty DB.
- Rolling back on prod: `goose down-to 0` first (with the new binary), then the old binary — the old one re-adds an empty `daily` column and breaks the Down migration.
- **Auth** (`internal/auth`, `transport/auth_handler.go`): one password from `APP_PASSWORD`; empty = auth off (dev). Stateless session cookie = HMAC(password); `RequireAuth` wraps the mux in `main.go` and leaves `/auth/*`, `/healthz`, `OPTIONS` open. Frontend: any `401 UNAUTHORIZED` fires `onUnauthorized` in `api/client.ts` → `useAuth` → `LoginScreen`. Cookies need same-origin, so auth + cross-origin `VITE_API_URL` don't mix; in dev leave `APP_PASSWORD` empty. nginx must proxy `/auth` too.
- CI: `.github/workflows/ci.yml` (Go with a Postgres service → `TEST_DB_URL` tests run; frontend lint/test/build). DB backups: `scripts/backup.sh`.
- `_legacy/` (old CLI, file storage, `old_cod/`, `data/tasks.json`) is ignored by the Go toolchain and does not compile; don't revive it.
- `frontend/dist/` is gitignored (built locally or inside the frontend image), never committed.

## Docker

Full stack lives in `compose.yml`: `db` (postgres:17-alpine) → `backend` (multi-stage Go build → alpine) → `frontend` (Vite build → nginx:alpine serving `dist` and reverse-proxying `/tasks`, `/projects`, `/day`, `/stats` to `backend`).

```bash
cp .env.example .env            # compose auto-loads ./.env for ${...} substitution
docker compose up -d --build
docker compose logs -f backend
docker compose down             # add -v to also drop the pgdata volume
```

Defaults: frontend on `:8081`, API on `:8080`, Postgres bound to `127.0.0.1:5432` only. Override via `FRONTEND_PORT` / `API_PORT` / `DB_PORT` in `.env`.

Non-obvious pieces:

- **`db/init.sql`** runs **only on first init of an empty `pgdata` volume** (`/docker-entrypoint-initdb.d`). Schema changes go into a new goose migration in `migrations/`, never into `init.sql`.
- The backend image must `COPY migrations` — the Go code imports the `todo/migrations` package.
- **`VITE_API_URL` is a build arg, not runtime config** — it is inlined into the JS bundle. Default is empty, which makes `api/client.ts` emit relative requests that the frontend's own nginx proxies to `backend`. Same origin means the `corsMiddleware` in `main.go` stops mattering. Set it only to point the bundle at a different API host, and remember the image must be rebuilt to change it.
- **`frontend/.dockerignore` excludes `frontend/.env`** on purpose, so the VPS URL in it never leaks into the image and silently overrides the build arg.
- **`nginx.conf` uses `resolver 127.0.0.11` + a variable in `proxy_pass`.** Without it nginx resolves `backend` once at startup and caches the IP forever — after `compose up -d --build` the recreated backend gets a new IP and the proxy 502s until nginx restarts.
- **`GET /healthz`** in `main.go` exists solely for the container healthcheck. It is a liveness probe and deliberately does not touch the DB.
- `stop_grace_period: 20s` on `backend` must stay above `HTTP_SHUTDOWN_TIMEOUT` (10s), or Docker SIGKILLs the process mid-graceful-shutdown.

For day-to-day work the native flow (`go run ./cmd/todo-api` + `npm run dev`) stays faster; compose is for prod-shaped runs and deploys.

## Deployment

The app runs on a VPS (`95.85.252.88`). The legacy path — Go binary under systemd plus a host nginx fed by `frontend/deploy-frontend.sh` (gitignored rsync of `dist`) — is being replaced by the Docker stack above: `git pull && docker compose up -d --build`.

Migration notes: host nginx already occupies port 80, which is why `frontend` publishes `8081` by default (either free port 80 or have host nginx proxy to `8081`). The existing host Postgres must be dumped into the container volume (`pg_dump` → `docker compose exec -T db psql`) before the systemd unit is disabled. Server `.env` is untracked, so `git pull` never overwrites it.
