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

---

# После Этапов 7–11 (вход, бэкапы, CI, «Неделя», повторы, поиск)

## Уже сделано из репозитория (2026-09-25)

- ✅ **6.** `frontend/nginx.conf`: `auth` в регулярке прокси.
- ✅ **7 (часть в git).** `compose.yml`: бэкенду передаются `APP_PASSWORD` и `APP_TZ`.
- ✅ **9.** CI `.github/workflows/ci.yml` — запускается сам на push.
- ✅ **10 (git).** `redesign/stage-1` смержена в `main` и запушена.
- ✅ Проверено локально в Docker (те же `Dockerfile`, `compose.yml`, `postgres:17-alpine`): образы собираются, миграции
  до версии 7, через nginx фронта `/auth/status` → вход включён, `/tasks` без входа → 401, вход → 204, неделя и поиск
  работают, `ILIKE` по кириллице без учёта регистра → `t`; `scripts/backup.sh` + восстановление из шапки скрипта.

## Осталось на VPS (нужен доступ по SSH — у Claude его нет)

Всё по порядку, одной сессией `ssh root@95.85.252.88`:

```bash
cd /root/todo

# 1) копия базы ДО обновления (scripts/backup.sh появится только после pull — поэтому руками)
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  | gzip > ~/todo-before-stage7-$(date +%F).sql.gz
gunzip -c ~/todo-before-stage7-*.sql.gz | tail -3        # должно быть «PostgreSQL database dump complete»

# 2) пароль входа — в серверный .env (не в git)
grep -q '^APP_PASSWORD=' .env || echo "APP_PASSWORD=$(openssl rand -base64 18)" >> .env
grep '^APP_PASSWORD=' .env                                # записать в менеджер паролей

# 3) код и перезапуск
git pull
docker compose up -d --build
docker compose logs backend | grep -E 'goose|WARNING'    # «migrated database to version: 7», WARNING быть не должно

# 4) проверки через фронтовой контейнер (порт 8091 из .env)
curl -s http://127.0.0.1:8091/auth/status; echo           # {"authed":false,"enabled":true}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8091/tasks   # 401
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select '"'"'ДОКЕР'"'"' ILIKE '"'"'%докер%'"'"'"'
                                                          # t — поиск по-русски без учёта регистра работает

# 5) бэкапы по cron
scripts/backup.sh                                         # «backup ok: …/todo-….sql.gz»
( crontab -l 2>/dev/null; echo '0 4 * * * cd /root/todo && scripts/backup.sh >> /var/log/todo-backup.log 2>&1' ) | crontab -
crontab -l | grep backup
```

**Важно: это первый деплой редизайна.** На проде сейчас старый `main` (API `/todos`, колонка `daily`), поэтому при
старте бэкенд прогонит на боевой базе **все** миграции 00001–00007 (списки, `daily` → `scheduled_for`, новые колонки,
`repeat`). Они обратимые и проверены тестами на копии схемы со старыми данными, но копия из шага 1 обязательна.

Если что-то пошло не так — откат только через копию (старый код поверх мигрированной базы не работает, см. §4):

```bash
docker compose stop backend
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP TABLE IF EXISTS goose_db_version, projects CASCADE;"'
gunzip -c ~/todo-before-stage7-*.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
git checkout 0182613 && docker compose up -d --build     # прежний прод
```

Копию бэкапов время от времени стоит утаскивать к себе (бэкап на том же диске не спасёт от смерти диска):

```bash
scp root@95.85.252.88:'~/todo-backups/todo-*.sql.gz' ~/Backups/todo/
```

## 11. iPhone — проверить руками

- PWA установить заново (иначе iOS держит старый `start_url`), войти паролем один раз; после перезапуска PWA
  сессия сохраняется.
- Отступы под чёлкой и home-индикатором на всех экранах, включая «Неделю».
- Свайп строки не мешает вертикальной прокрутке; перетаскивание задачи на день в полосе недели;
  чип бэклога тащится на день и не мешает прокрутке.
- Тост «удалено · вернуть» не перекрывается home-индикатором.
- Поле ввода и поиск не зумят страницу при фокусе.
- Светлая тема: статус-бар читается.
