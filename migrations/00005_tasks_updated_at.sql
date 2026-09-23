-- +goose Up
-- «Когда задачу последний раз трогали» — для подборки залежавшихся в /day/suggestions.
-- Старым задачам берём самое позднее известное событие: выполнение или создание.
ALTER TABLE tasks ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE tasks SET updated_at = COALESCE(done_at, created_at);

-- +goose Down
ALTER TABLE tasks DROP COLUMN updated_at;
