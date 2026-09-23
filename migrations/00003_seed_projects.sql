-- +goose Up
-- Списки владельца. Существующие задачи не раскладываем — они остаются во «Входящих».
INSERT INTO projects (name, color, position) VALUES
    ('Go',              '#6AA6FF', 1),
    ('Учёба',           '#F5B851', 2),
    ('Todo',            '#7DE0D1', 3),
    ('Finance-Tracker', '#4ADE80', 4),
    ('Стажировка',      '#C08BFF', 5),
    ('Личное',          '#6E6E85', 6);

-- +goose Down
-- задачи из этих списков вернутся во «Входящие» (ON DELETE SET NULL)
DELETE FROM projects
WHERE name IN ('Go', 'Учёба', 'Todo', 'Finance-Tracker', 'Стажировка', 'Личное');
