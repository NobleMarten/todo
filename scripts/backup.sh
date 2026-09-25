#!/usr/bin/env bash
# Бэкап базы todo из docker compose: pg_dump → gzip, хранятся последние KEEP копий.
#
#   scripts/backup.sh                 # в ~/todo-backups
#   BACKUP_DIR=/srv/backups KEEP=30 scripts/backup.sh
#
# Для cron (раз в сутки в 04:00):
#   0 4 * * * cd /root/todo && scripts/backup.sh >> /var/log/todo-backup.log 2>&1
#
# Восстановление (дамп с --clean, сам пересоздаёт таблицы; backend лучше остановить):
#   docker compose stop backend
#   gunzip -c ~/todo-backups/todo-2026-09-25_0400.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
#   docker compose start backend
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/todo-backups}"
KEEP="${KEEP:-14}"

cd "$(dirname "$0")/.."
mkdir -p "$BACKUP_DIR"

file="$BACKUP_DIR/todo-$(date +%F_%H%M).sql.gz"
tmp="$file.part"

# Имя пользователя и базы берём из окружения контейнера db — те же, что в .env.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > "$tmp"

# Пустой или оборванный дамп не должен вытеснить хорошие копии.
if ! gunzip -c "$tmp" | grep -q 'PostgreSQL database dump complete'; then
  rm -f "$tmp"
  echo "$(date '+%F %T') backup FAILED: dump incomplete" >&2
  exit 1
fi
mv "$tmp" "$file"

# Ротация: оставляем KEEP самых свежих.
ls -1t "$BACKUP_DIR"/todo-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "$(date '+%F %T') backup ok: $file ($(du -h "$file" | cut -f1))"
