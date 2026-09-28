-- +goose Up
-- Несколько пользователей, у каждого свои задачи и списки. Вход — логин и пароль,
-- сессия — случайный токен в cookie; в базе лежит только его SHA-256 (как api_tokens в finance-tracker):
-- утёкшая таблица sessions не даёт войти.

CREATE TABLE users (
    id            SERIAL      PRIMARY KEY,
    login         TEXT        NOT NULL UNIQUE,
    -- bcrypt; NULL — пароль ещё не задан (todo-api user passwd), войти нельзя
    password_hash TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    token_hash BYTEA       PRIMARY KEY,
    user_id    INT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- продлевается при использовании: не заходили дольше срока — сессия умерла
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- всё, что было до пользователей, — владельца; пароль он задаёт командой после деплоя
INSERT INTO users (login) VALUES ('noblemarten');

ALTER TABLE projects ADD COLUMN user_id INT REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN user_id INT REFERENCES users (id) ON DELETE CASCADE;
UPDATE projects SET user_id = (SELECT id FROM users WHERE login = 'noblemarten');
UPDATE tasks SET user_id = (SELECT id FROM users WHERE login = 'noblemarten');
ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN user_id SET NOT NULL;

-- Задача может лежать только в своём списке и быть подзадачей только своей задачи — это держит сама база,
-- даже если проверку в сервисе когда-нибудь забудут. Составные ключи ссылаются на (id, user_id).
ALTER TABLE projects ADD CONSTRAINT projects_id_user_id_key UNIQUE (id, user_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_id_user_id_key UNIQUE (id, user_id);
-- удалили список — задачи во «Входящие»: обнуляется только project_id, user_id остаётся (PostgreSQL 15+)
ALTER TABLE tasks ADD CONSTRAINT tasks_project_same_user_fkey
    FOREIGN KEY (project_id, user_id) REFERENCES projects (id, user_id) ON DELETE SET NULL (project_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_parent_same_user_fkey
    FOREIGN KEY (parent_id, user_id) REFERENCES tasks (id, user_id) ON DELETE CASCADE;

-- любой запрос теперь начинается с «задачи/списки этого пользователя»
CREATE INDEX tasks_user_id_idx ON tasks (user_id);
CREATE INDEX projects_user_id_position_idx ON projects (user_id, archived, position);

-- +goose Down
-- Колонки и таблицы новые: при откате все задачи и списки снова общие, пользователи и сессии пропадают.
DROP INDEX projects_user_id_position_idx;
DROP INDEX tasks_user_id_idx;
ALTER TABLE tasks DROP CONSTRAINT tasks_parent_same_user_fkey;
ALTER TABLE tasks DROP CONSTRAINT tasks_project_same_user_fkey;
ALTER TABLE tasks DROP CONSTRAINT tasks_id_user_id_key;
ALTER TABLE projects DROP CONSTRAINT projects_id_user_id_key;
ALTER TABLE tasks DROP COLUMN user_id;
ALTER TABLE projects DROP COLUMN user_id;
DROP TABLE sessions;
DROP TABLE users;
