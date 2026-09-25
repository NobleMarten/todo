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

Всё ниже — снова твоя зона. Порядок важен: **п. 6 и 7 делаются в один деплой**, иначе приложение
либо останется открытым, либо не пустит тебя самого.

## 6. `frontend/nginx.conf` — добавить `auth` в регулярку прокси

Вход живёт на `/auth/*`. Без этого `POST /auth/login` уходит в SPA-фолбэк, и войти нельзя.

```nginx
location ~ ^/(tasks|projects|day|stats|auth)(/|$) {
```

(«Неделя» и поиск новых префиксов не добавили: они под `/day` и `/tasks`.)

## 7. `compose.yml` + серверный `.env` — пароль

В `services.backend.environment`:

```yaml
APP_PASSWORD: ${APP_PASSWORD:-}
```

На VPS в `/root/todo/.env` (он не в git):

```bash
echo "APP_PASSWORD=$(openssl rand -base64 18)" >> /root/todo/.env   # или свой пароль
grep APP_PASSWORD /root/todo/.env                                    # запомнить / в менеджер паролей
```

Проверка после деплоя:

```bash
docker compose logs backend | grep -c "APP_PASSWORD is empty"      # 0 — вход включён
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8091/tasks   # 401
curl -s http://127.0.0.1:8091/auth/status                             # {"authed":false,"enabled":true}
```

Сессия живёт год. Сменить пароль = разлогинить все устройства. **Без HTTPS пароль при входе идёт открытым
текстом** — от случайных посетителей и ботов защищает, от перехвата в чужом Wi-Fi нет.

## 8. Бэкапы по cron

```bash
cd /root/todo && scripts/backup.sh          # первый прогон руками: "backup ok: …/todo-….sql.gz"
crontab -e
# 0 4 * * * cd /root/todo && scripts/backup.sh >> /var/log/todo-backup.log 2>&1
```

Копии в `~/todo-backups`, хранятся 14 последних (`KEEP=`/`BACKUP_DIR=` меняют). Восстановление — в шапке скрипта.
Лучше периодически утаскивать копию с VPS к себе: бэкап на том же диске не спасёт от смерти диска.

```bash
scp root@95.85.252.88:'~/todo-backups/todo-*.sql.gz' ~/Backups/todo/
```

## 9. CI

`.github/workflows/ci.yml` запускается сам на каждый push в GitHub — делать ничего не надо.
Результат — вкладка Actions. Если красное, сначала смотри шаг `gofmt` и `npm ci`.

## 10. Мерж и деплой

```bash
# локально
git checkout main && git merge --ff-only redesign/stage-1 && git push
# на VPS: сначала копия базы (п. 8 или руками), потом
cd /root/todo && git pull && docker compose up -d --build
docker compose logs backend | grep goose     # новые миграции: 00007 (повторы) — см. журнал REDESIGN.md
```

## 11. iPhone — проверить руками

- PWA установлена заново (иначе iOS держит старый `start_url`), вход по паролю один раз, после перезапуска
  PWA сессия сохраняется.
- Отступы под чёлкой и home-индикатором на всех экранах, включая «Неделю».
- Свайп строки не мешает вертикальной прокрутке; перетаскивание задачи на день в полосе недели.
- Тост «удалено · вернуть» не перекрывается home-индикатором.
- Поле ввода не зумит страницу при фокусе.
- Светлая тема: статус-бар читается.
