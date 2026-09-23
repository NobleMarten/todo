> ✅ Выполнено 2026-09-23. Оставлено как справка и как шаблон для похожих переездов.

# Переезд todo с systemd на Docker (VPS 95.85.252.88)

Разведка проведена, значения ниже — настоящие.

| Что | Значение |
|---|---|
| systemd-юнит | `todo-api.service` |
| проект | `/root/todo` |
| бинарник | `/root/todo/todo-api` |
| переменные | `/etc/todo-api.env` (там DB_URL с паролем) |
| база | `todo_vps_db`, владелец `todo_user`, хостовый Postgres `127.0.0.1:5432` |
| статика | `/var/www/todo-frontend` |
| nginx-сайт | `/etc/nginx/sites-enabled/todo-frontend` |
| Docker | 29.4.1, уже установлен |

Занятые порты: 80 и 8095 (nginx), 8080 (todo-api), 5432 (postgres),
3000/8081/5433 (finance-tracker), 8090 (beszel).
Берём свободные: **8082** (API), **8091** (фронт), **5434** (БД).

Сайт слушает **8095**, а не 80 — на 80 у nginx другой сайт.

Старый systemd НЕ гасим до самого конца — откат в один шаг.

## 1. Бэкап базы — ДО всего остального

```bash
cd /tmp    # иначе postgres ругнётся "could not change directory to /root"
su postgres -c 'pg_dump -d todo_vps_db --clean --if-exists' > /tmp/todo-backup-$(date +%F).sql
ls -lh /tmp/todo-backup-*.sql
grep -c 'COPY\|INSERT' /tmp/todo-backup-*.sql    # данные на месте?
```

## 2. Код

```bash
cd /root/todo && git pull origin main
```

## 3. Создать /root/todo/.env

Его нет и в git он не попадёт. Пароль придумываешь НОВЫЙ — контейнерная
база создаётся с нуля, старый из /etc/todo-api.env не нужен.

```bash
cat > /root/todo/.env <<'ENV'
ENV=prod
HTTP_SHUTDOWN_TIMEOUT=10s

POSTGRES_USER=todo_user
POSTGRES_PASSWORD=ПРИДУМАТЬ_НОВЫЙ
POSTGRES_DB=todo_vps_db

BIND_IP=127.0.0.1
API_PORT=8082
FRONTEND_PORT=8091
DB_PORT=5434

VITE_API_URL=
ENV
chmod 600 /root/todo/.env
```

ВАЖНО: пароль должен быть в .env ДО первого `up`. Postgres читает
POSTGRES_PASSWORD только при инициализации пустого тома — поменять потом
без пересоздания тома нельзя.

VITE_API_URL пустой намеренно: фронт будет слать относительные /todos,
их проксирует nginx внутри контейнера. Старый бандл ходил напрямую
на http://95.85.252.88:8080 — после переезда так уже не нужно.

## 4. Поднять стек (старый всё ещё работает)

```bash
cd /root/todo
docker compose up -d --build
docker compose ps                  # db и backend → healthy
docker compose logs backend | tail
```

## 5. Залить дамп

```bash
docker compose exec -T db psql -U todo_user -d todo_vps_db < /tmp/todo-backup-*.sql
curl -s localhost:8091/todos | head -c 300
```

Пусто или ошибка → СТОП. systemd работает, ничего не потеряно.

## 6. Переключить nginx

В `/etc/nginx/sites-enabled/todo-frontend` заменить блок, отдающий статику
из /var/www/todo, на проксирование в контейнер:

```nginx
server {
    listen 8095;
    server_name _;

location / {
    proxy_pass http://127.0.0.1:8091;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```bash
cp /etc/nginx/sites-enabled/todo-frontend /root/todo-frontend.nginx.bak
nginx -t && systemctl reload nginx
```

Проверить сайт в браузере. Не ок → вернуть бэкап, reload.

## 7. Погасить systemd — только после проверки

```bash
systemctl stop todo-api.service
systemctl disable todo-api.service
```

После этого 8080 освобождается. Старый API торчал на `*:8080`, то есть
был доступен из интернета — если в фаерволе открыт 8080, закрыть.

Не удалять: `/etc/todo-api.env`, `/root/todo/todo-api`, `/var/www/todo`,
`/root/todo-frontend.nginx.bak` — пока не убедишься, что всё живёт неделю.

## Откат на любом шаге

```bash
cd /root/todo && docker compose down          # том с данными остаётся
cp /root/todo-frontend.nginx.bak /etc/nginx/sites-enabled/todo-frontend
nginx -t && systemctl reload nginx
systemctl start todo-api.service
```

## Обновления после переезда

```bash
cd /root/todo && git pull && docker compose up -d --build
```
