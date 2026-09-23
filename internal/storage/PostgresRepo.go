package storage

import (
	"database/sql"
	"todo/internal/model"
)

type PostgresRepo struct {
	db *sql.DB
}

// NewPostgresRepo получает уже открытую и мигрированную базу (см. NewDB и Migrate)
// и сам больше ничего не создаёт.
func NewPostgresRepo(db *sql.DB) *PostgresRepo {
	return &PostgresRepo{db: db}
}

// taskColumns — порядок колонок, который ожидает scanTask.
const taskColumns = "id, title, done, priority, project_id, parent_id, due_date, scheduled_for, position, note, created_at, done_at"

// rowScanner — общее у *sql.Row и *sql.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanTask(row rowScanner) (model.Task, error) {
	var task model.Task
	err := row.Scan(&task.ID, &task.Title, &task.Done, &task.Priority, &task.ProjectID, &task.ParentID,
		&task.DueDate, &task.ScheduledFor, &task.Position, &task.Note, &task.CreatedAt, &task.DoneAt)
	return task, err
}

func (pr *PostgresRepo) Create(title string, priority string) (model.Task, error) {
	row := pr.db.QueryRow("INSERT INTO tasks (title, done, priority, created_at) VALUES ($1, false, $2, NOW()) RETURNING "+taskColumns, title, priority)
	task, err := scanTask(row)
	if err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (pr *PostgresRepo) List() ([]model.Task, error) {
	rows, err := pr.db.Query("SELECT " + taskColumns + " FROM tasks ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []model.Task
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (pr *PostgresRepo) GetByID(id int) (model.Task, error) {
	row := pr.db.QueryRow("SELECT "+taskColumns+" FROM tasks WHERE id = $1", id)
	task, err := scanTask(row)
	if err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (pr *PostgresRepo) Update(id int, title string) (model.Task, error) {
	row := pr.db.QueryRow("UPDATE tasks SET title = $1 WHERE id = $2 RETURNING "+taskColumns, title, id)
	task, err := scanTask(row)
	if err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (pr *PostgresRepo) Done(id int) (model.Task, error) {
	row := pr.db.QueryRow("UPDATE tasks SET done = true, done_at = NOW() WHERE id = $1 AND done = false RETURNING "+taskColumns, id)
	task, err := scanTask(row)
	if err != nil {
		task, err = pr.GetByID(id)
		if err == sql.ErrNoRows {
			return model.Task{}, model.ErrNotFound
		}
		if err != nil {
			return model.Task{}, err
		}
		if task.Done {
			return model.Task{}, model.ErrAlreadyDone
		}
	}
	return task, nil
}

func (pr *PostgresRepo) Undone(id int) (model.Task, error) {
	row := pr.db.QueryRow("UPDATE tasks SET done = false, done_at = NULL WHERE id = $1 AND done = true RETURNING "+taskColumns, id)
	task, err := scanTask(row)
	if err != nil {
		task, err = pr.GetByID(id)
		if err == sql.ErrNoRows {
			return model.Task{}, model.ErrNotFound
		}
		if err != nil {
			return model.Task{}, err
		}
		if !task.Done {
			return model.Task{}, model.ErrAlreadyUndone
		}
	}
	return task, nil
}

func (pr *PostgresRepo) Delete(id int) (model.Task, error) {
	row := pr.db.QueryRow("DELETE FROM tasks WHERE id = $1 RETURNING "+taskColumns, id)
	task, err := scanTask(row)
	if err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (pr *PostgresRepo) Patch(id int, title *string, done *bool, priority *string, daily *bool) (model.Task, error) {
	if title != nil {
		if *title == "" {
			return model.Task{}, model.ErrEmptyTitle
		}
	}

	// daily=true/false из старого API пока пишет в scheduled_for (бывшая колонка daily).
	query := `UPDATE tasks SET
		title = COALESCE($1, title),
		done = COALESCE ($2, done),
		priority = COALESCE ($3, priority),
		done_at = CASE
			WHEN $2 = true THEN NOW()
			WHEN $2 = false THEN NULL
			else done_at
		END,
		scheduled_for = CASE
			WHEN $5 = true THEN (now() AT TIME ZONE 'Europe/Moscow')::date
			WHEN $5 = false THEN NULL
			else scheduled_for
		END
	WHERE id = $4
	RETURNING ` + taskColumns

	row := pr.db.QueryRow(query, title, done, priority, id, daily)
	task, err := scanTask(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return model.Task{}, model.ErrNotFound
		}
		return model.Task{}, err
	}
	return task, nil
}

func (pr *PostgresRepo) Clear() error {
	_, err := pr.db.Exec("TRUNCATE tasks RESTART IDENTITY")
	if err != nil {
		return err
	}
	return nil
}
