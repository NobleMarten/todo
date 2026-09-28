-- +goose Up
-- Сколько раз задачу переносили: due_date или scheduled_for сдвинули на более позднюю дату
-- (PATCH, «на сегодня», сборка дня). Истории нет, так что у старых задач счёт идёт с нуля.
ALTER TABLE tasks ADD COLUMN postponed INT NOT NULL DEFAULT 0;

-- +goose Down
-- Колонка новая: при откате теряется только счётчик переносов.
ALTER TABLE tasks DROP COLUMN postponed;
