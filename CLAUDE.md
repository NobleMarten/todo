# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Go, module `todo`)

```bash
go run ./cmd/todo-api            # HTTP API (needs DB_URL; see Config below)
go run ./cmd/todo-cli help       # CLI: help | list | add "title" | done ID | undone ID | del ID
go build ./...
go test ./...
go test ./internal/service -run TestPatch_Done -v   # single test
```

Config comes from env (`internal/config`): `godotenv` loads `.envlocal`, falling back to `.env` (both gitignored; see `.env.example`). `DB_URL` is required — the API exits if it is missing. `PORT` defaults to 8080, `HTTP_SHUTDOWN_TIMEOUT` to 10s.

### Frontend (`frontend/`, React 19 + Vite)

```bash
npm run dev      # dev server
npm run build    # -> frontend/dist
npm run lint
```

`VITE_API_URL` in `frontend/.env` points at the backend (currently the VPS, not localhost — change it to `http://localhost:8080` when developing against a local API).

## Architecture

Layered Go backend + a single-page React frontend that talks to it over REST.

```
transport (HTTP)  ->  service (business logic)  ->  storage.RepoStorage  ->  model
```

**Two binaries share the service layer but not the storage.** `cmd/todo-api` wires `PostgresRepo`; `cmd/todo-cli` wires `FileRepo` over `data/tasks.json`. Tests wire `FakeRepo` (in-memory). All three implement `storage.RepoStorage` (`internal/storage/file_repo.go`), so **adding a repo method means implementing it in all three** — `PostgresRepo.go`, `file_repo.go`, `fake_storage.go`.

**Routing is hand-rolled.** `main.go` points `/todos`, `/todos/`, and `/todos/clear` at one handler, `Handler.Todos`, which dispatches on `r.Method` plus path prefix/suffix checks (`/done`, `/undone`, `/clear`, numeric id). There is no router library and no path-param parsing helper — ids are pulled with `strings.TrimPrefix` + `strconv.Atoi` in each handler.

**Filtering, sorting, and pagination are in-memory, not SQL.** `GetTodos` calls `svc.List()` (full table), then pipes the slice through `FilterByDate` → `FilterByDone` → `SortTasks` → `Paginate`. `total` is counted before pagination. Query parsing lives in `internal/transport/query_helpers.go`; each parser returns an `ok` flag meaning "the param was present", and the stage is skipped when false (pagination needs *both* `limit` and `offset` to engage).

**Errors.** `internal/model/errors.go` holds sentinel errors; `transport.WriteError` maps them to an HTTP status plus a JSON `{code, message}` body, defaulting to a logged 500. Note handlers are inconsistent: many parse/encode paths still use plain-text `http.Error` instead of `WriteError`.

**The `daily` field spans four names**: DB column `daily` (DATE), Go field `Task.DailyDate` (`*time.Time`), JSON `daily_date`, and the PATCH request field `daily` (`*bool` — `true` sets today, `false` clears). `PostgresRepo.Patch` sets it with `(now() AT TIME ZONE 'Europe/Moscow')::date`.

**Postgres schema is not migrated from files.** `NewPostgresRepo` runs idempotent `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS` for `priority` and `daily` at startup; the `tasks` table itself must already exist. New columns should follow that pattern or be created out of band.

### Frontend

`App.tsx` is the only page; all data lives in `hooks/useTodos.ts`, which owns fetch state, optimistic mutations (update local state → PATCH → reload/rollback), and the manual drag order.

- **Sections are derived client-side**, not stored: `lib/format.ts:sectionOf` puts a task in `daily` if `daily_date` is today, else its priority bucket (`high`/`medium`/`low`). `isDailyTask` compares the leading `YYYY-MM-DD` substring rather than parsing through `Date()` — that avoids a timezone shift dropping a day, so keep it string-based.
- **Manual order is local-only**, persisted in `localStorage` under `todo-manual-order` as `Record<Section, number[]>`. The backend has no concept of ordering.
- **Drag and drop** (`components/lists.tsx`) puts section headers and tasks in one `framer-motion` `Reorder.Group`, encoded as string keys `h:<section>` / `t:<id>`. Dragging is local-only until drop; `App.handleCommit` then splits the key list at the headers, rewrites the per-section orders, and issues a PATCH for every task that landed under a different header.
- **The list view fetches `done=all` and filters client-side** when showing active tasks, because "done" rows still need to appear in the "выполнено сегодня" group. Only the completed-only filter is pushed to the server.
- `hooks/useActivity.ts` separately fetches all completed tasks and buckets them by local day of `done_at` for the contribution grid.
- `lib/format.ts` is the shared source of truth for sections, priority labels/weights, date keys, and Russian pluralization. UI strings are Russian.

## Gotchas

- `frontend/` has **no `tsconfig.json` and no TypeScript installed** — Vite transpiles `.tsx` without type checking. `eslint.config.js` also only matches `**/*.{js,jsx}`, so `npm run lint` does not cover the app source. Type and lint errors will not surface from any command here; verify by reading.
- `service.Update` and `service.Patch` call `ValidateTitle` but discard both return values, so titles are neither trimmed nor validated on update paths (only on `Add`).
- `FileRepo` and `FakeRepo` return a zero `Task` (and often `nil` error) from several mutations rather than the updated row; `PostgresRepo` returns the real row. Don't rely on mutation return values being consistent across repos.
- `old_cod/` is dead commented-out code kept for reference; ignore it.
- `frontend/dist/` and `data/tasks.json` are committed build/state artifacts.

## Docker

Full stack lives in `compose.yml`: `db` (postgres:17-alpine) → `backend` (multi-stage Go build → alpine) → `frontend` (Vite build → nginx:alpine serving `dist` and reverse-proxying `/todos` to `backend`).

```bash
cp .env.example .env            # compose auto-loads ./.env for ${...} substitution
docker compose up -d --build
docker compose logs -f backend
docker compose down             # add -v to also drop the pgdata volume
```

Defaults: frontend on `:8081`, API on `:8080`, Postgres bound to `127.0.0.1:5432` only. Override via `FRONTEND_PORT` / `API_PORT` / `DB_PORT` in `.env`.

Non-obvious pieces:

- **`db/init.sql` holds the `CREATE TABLE tasks` DDL** that the Go code never had. It runs **only on first init of an empty `pgdata` volume** (`/docker-entrypoint-initdb.d`) — editing it does nothing to an existing volume. Schema changes on a live DB must be applied by hand, or follow the existing `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern in `NewPostgresRepo`.
- **`VITE_API_URL` is a build arg, not runtime config** — it is inlined into the JS bundle. Default is empty, which makes `api.ts` emit relative `/todos` requests that the frontend's own nginx proxies to `backend`. Same origin means the `corsMiddleware` in `main.go` stops mattering. Set it only to point the bundle at a different API host, and remember the image must be rebuilt to change it.
- **`frontend/.dockerignore` excludes `frontend/.env`** on purpose, so the VPS URL in it never leaks into the image and silently overrides the build arg.
- **`nginx.conf` uses `resolver 127.0.0.11` + a variable in `proxy_pass`.** Without it nginx resolves `backend` once at startup and caches the IP forever — after `compose up -d --build` the recreated backend gets a new IP and the proxy 502s until nginx restarts.
- **`GET /healthz`** in `main.go` exists solely for the container healthcheck. It is a liveness probe and deliberately does not touch the DB.
- `stop_grace_period: 20s` on `backend` must stay above `HTTP_SHUTDOWN_TIMEOUT` (10s), or Docker SIGKILLs the process mid-graceful-shutdown.
- The CLI (`cmd/todo-cli`, file storage) is not containerized; it still runs natively against `data/tasks.json`.

For day-to-day work the native flow (`go run ./cmd/todo-api` + `npm run dev`) stays faster; compose is for prod-shaped runs and deploys.

## Deployment

The app runs on a VPS (`95.85.252.88`). The legacy path — Go binary under systemd plus a host nginx fed by `frontend/deploy-frontend.sh` (gitignored rsync of `dist`) — is being replaced by the Docker stack above: `git pull && docker compose up -d --build`.

Migration notes: host nginx already occupies port 80, which is why `frontend` publishes `8081` by default (either free port 80 or have host nginx proxy to `8081`). The existing host Postgres must be dumped into the container volume (`pg_dump` → `docker compose exec -T db psql`) before the systemd unit is disabled. Server `.env` is untracked, so `git pull` never overwrites it.
