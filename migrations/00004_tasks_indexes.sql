-- +goose Up
CREATE INDEX tasks_project_id_idx    ON tasks (project_id);
CREATE INDEX tasks_parent_id_idx     ON tasks (parent_id);
CREATE INDEX tasks_scheduled_for_idx ON tasks (scheduled_for);
CREATE INDEX tasks_due_date_idx      ON tasks (due_date);
-- почти все вьюхи смотрят только на активные задачи
CREATE INDEX tasks_active_idx        ON tasks (done) WHERE done = false;

-- +goose Down
DROP INDEX tasks_active_idx;
DROP INDEX tasks_due_date_idx;
DROP INDEX tasks_scheduled_for_idx;
DROP INDEX tasks_parent_id_idx;
DROP INDEX tasks_project_id_idx;
