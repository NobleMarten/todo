-- +goose Up
-- На живой базе priority добавлялась через ADD COLUMN IF NOT EXISTS без NOT NULL,
-- а код читает её в string: одна NULL-строка валила бы любой список с 500.
UPDATE tasks SET priority = 'low' WHERE priority IS NULL OR priority NOT IN ('high', 'medium', 'low');
ALTER TABLE tasks
    ALTER COLUMN priority SET DEFAULT 'low',
    ALTER COLUMN priority SET NOT NULL;

-- +goose Down
-- исправленные значения назад не возвращаем: 'low' и был смыслом NULL
ALTER TABLE tasks ALTER COLUMN priority DROP NOT NULL;
