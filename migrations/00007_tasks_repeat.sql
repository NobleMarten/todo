-- +goose Up
-- Правило повтора (model.Repeat): daily | weekdays | weekly:1,4 | monthly:15. NULL — задача не повторяется.
-- Формат проверяет сервис; когда повторяющуюся задачу выполняют, он создаёт следующую.
ALTER TABLE tasks ADD COLUMN repeat TEXT;

-- +goose Down
-- Колонка новая: при откате теряются только правила повтора, сами задачи остаются.
ALTER TABLE tasks DROP COLUMN repeat;
