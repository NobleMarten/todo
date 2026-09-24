# Что сделать руками (после Этапа 2)

Всё ниже — в твоей зоне (Docker/nginx/VPS), я туда не лез. Код бэкенда готов, но **деплоить
ветку `redesign/stage-1` пока нельзя**: старый фронт ходит в `/todos`, а его больше нет.
Деплой — после Этапа 3, когда будет новый фронт.

---

## 1. Dockerfile — одна строка (обязательно, иначе образ не соберётся)

С Этапа 1 бэкенд импортирует пакет `todo/migrations` (там SQL-миграции, вшитые в бинарник),
а Dockerfile копирует в сборку только `cmd` и `internal`. Сборка падает с
`package todo/migrations is not in std`.

В `Dockerfile`, рядом с остальными `COPY`:

```dockerfile
COPY cmd ./cmd
COPY internal ./internal
COPY migrations ./migrations   # ← добавить
```

Проверка локально: `docker compose build backend` проходит.

## 2. `frontend/nginx.conf` — проксировать новые пути API (к Этапу 3)

Сейчас на бэкенд уходит только `location /todos`. Новые префиксы: `/tasks`, `/projects`, `/day`, `/stats`.
Заменить блок `location /todos { ... }` на тот же блок с регуляркой:

```nginx
location ~ ^/(tasks|projects|day|stats)(/|$) {
    set $api http://backend:8080;
    proxy_pass $api$request_uri;

    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Регулярка с `(/|$)` нарочно не цепляет фронтовые маршруты вроде `/task/5` или `/today`.

## 3. `compose.yml` — пробросить `APP_TZ` (по желанию)

Бэкенд читает таймзону из `APP_TZ` (по умолчанию `Europe/Moscow` — если устраивает, можно ничего не делать).
Чтобы её можно было менять через `.env`, в `services.backend.environment`:

```yaml
APP_TZ: ${APP_TZ:-Europe/Moscow}
```

## 4. День деплоя (после Этапа 3)

При первом старте новый бэкенд **сам** прогонит миграции 00001–00006 на боевой базе:
создаст `projects`, переименует `daily` → `scheduled_for`, добавит колонки, заменит `NULL` в `priority` на `low`.
Миграции обратимые и проверены тестами, но это первая правка схемы с живыми ~160 задачами —
поэтому сначала копия базы, одной командой:

```bash
cd /root/todo
docker compose exec -T db pg_dump -U todo_user --clean --if-exists todo_vps_db > ~/todo-before-redesign.sql
ls -lh ~/todo-before-redesign.sql     # файл не пустой
```

Потом обычный деплой и проверка:

```bash
git pull && docker compose up -d --build
docker compose logs backend | grep goose     # ждём "successfully migrated database to version: 6"
curl -s http://127.0.0.1:8082/tasks | head -c 300
```

### Если что-то пошло не так

Проще всего — вернуть копию (она пишется с `--clean`, то есть сама пересоздаёт таблицы):

```bash
docker compose stop backend
# таблиц projects и goose_db_version в копии нет — --clean их не тронет, сносим руками,
# иначе при следующем деплое goose решит, что миграции уже накатаны
docker compose exec -T db psql -U todo_user -d todo_vps_db -c 'DROP TABLE IF EXISTS goose_db_version, projects CASCADE;'
docker compose exec -T db psql -U todo_user -d todo_vps_db < ~/todo-before-redesign.sql
git checkout main && docker compose up -d --build backend frontend   # старый код
```

Важно: **не запускать старый бинарник поверх уже мигрированной базы без восстановления копии** —
он сделает `ADD COLUMN daily` заново (пустую), и данные «на сегодня» будут лежать в `scheduled_for`, невидимые для него.

## 5. Локально: почему в IDE «красные» файлы

`_legacy/cmd/todo-cli/main.go` — старый CLI, он ссылается на `storage.NewFileRepo`, которого в `internal/storage`
больше нет. Go-сборка каталоги с `_` игнорирует (`go build/vet/test ./...` зелёные), а IDE всё равно их подсвечивает.
Лечится одной строкой `//go:build ignore` в начале файла — могу добавить.
