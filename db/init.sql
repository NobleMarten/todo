-- Схема таблицы tasks.
--
-- В коде её нет: NewPostgresRepo умеет только доращивать колонки
-- (ALTER TABLE ... ADD COLUMN IF NOT EXISTS priority/daily), а саму таблицу
-- ожидает уже существующей. На пустой базе приложение из-за этого падает,
-- поэтому CREATE TABLE живёт здесь.
--
-- ВНИМАНИЕ: файлы из /docker-entrypoint-initdb.d выполняются ТОЛЬКО при
-- первой инициализации пустого тома. Если pgdata уже существует, файл
-- молча игнорируется — правки схемы на живой базе придётся накатывать руками.

CREATE TABLE IF NOT EXISTS tasks (
    id         SERIAL      PRIMARY KEY,
    title      TEXT        NOT NULL,
    done       BOOLEAN     NOT NULL DEFAULT false,
    priority   VARCHAR(10) NOT NULL DEFAULT 'low',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_at    TIMESTAMPTZ,
    daily      DATE
);
