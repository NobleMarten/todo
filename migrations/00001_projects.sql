-- +goose Up
CREATE TABLE projects (
    id         SERIAL      PRIMARY KEY,
    name       TEXT        NOT NULL,
    color      TEXT        NOT NULL DEFAULT '#6AA6FF',
    position   INT         NOT NULL DEFAULT 0,
    archived   BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- списки почти всегда читаются как «неархивные по порядку»
CREATE INDEX projects_archived_position_idx ON projects (archived, position);

-- +goose Down
DROP TABLE projects;
