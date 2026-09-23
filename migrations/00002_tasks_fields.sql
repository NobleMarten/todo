-- +goose Up

-- Базовая схема tasks. До goose её создавал только db/init.sql (в Docker) или руками,
-- а priority/daily доращивал NewPostgresRepo. Здесь то же самое идемпотентно,
-- чтобы миграции проходили и на пустой базе, и на живой с данными.
CREATE TABLE IF NOT EXISTS tasks (
    id         SERIAL      PRIMARY KEY,
    title      TEXT        NOT NULL,
    done       BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    done_at    TIMESTAMPTZ
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'low';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS daily DATE;

-- «на сегодня» теперь просто день, на который задача запланирована; данные сохраняются
ALTER TABLE tasks RENAME COLUMN daily TO scheduled_for;

ALTER TABLE tasks
    ADD COLUMN project_id INT REFERENCES projects (id) ON DELETE SET NULL,
    ADD COLUMN parent_id  INT REFERENCES tasks (id) ON DELETE CASCADE,
    ADD COLUMN due_date   DATE,
    ADD COLUMN position   INT NOT NULL DEFAULT 0,
    ADD COLUMN note       TEXT;

-- сохраняем текущий порядок (по id) как стартовый ручной порядок
UPDATE tasks SET position = id;

-- +goose Down
-- Новые колонки удаляются вместе с тем, что в них успели записать;
-- «на сегодня» возвращается в daily без потерь. Саму tasks не трогаем.
ALTER TABLE tasks
    DROP COLUMN note,
    DROP COLUMN position,
    DROP COLUMN due_date,
    DROP COLUMN parent_id,
    DROP COLUMN project_id;

ALTER TABLE tasks RENAME COLUMN scheduled_for TO daily;
