package storage

import (
	"database/sql"
	"todo/internal/model"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type PostgresRepo struct {
	db *sql.DB
}

func NewPostgresRepo(connStr string) (*PostgresRepo, error) {
	db, err := sql.Open("pgx", connStr) // открываем соединение с базой данных PostgreSQL с помощью драйвера pgx
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil { // проверяем соединение с базой данных
		return nil, err
	}
	return &PostgresRepo{db: db}, nil
}

func (pr *PostgresRepo) Create(title string) (model.Task, error) {
	row := pr.db.QueryRow("INSERT INTO tasks (title, done, created_at) VALUES ($1, false, NOW()) RETURNING id, title, done, created_at, done_at", title)
	var task model.Task
	if err := row.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt); err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (pr *PostgresRepo) List() ([]model.Task, error) {
	rows, err := pr.db.Query("SELECT * FROM tasks ORDER BY id")
	if err != nil {
		return nil, err
	}

	var tasks []model.Task
	for rows.Next() {
		var task model.Task
		if err := rows.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt); err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, nil
}

func (pr *PostgresRepo) GetByID(id int) (model.Task, error) {
	row := pr.db.QueryRow("SELECT * FROM tasks WHERE id = $1", id)
	var task model.Task
	if err := row.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt); err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (pr *PostgresRepo) Update(id int, title string) (model.Task, error) {
	row := pr.db.QueryRow("UPDATE tasks SET title = $1 WHERE id = $2 RETURNING id, title, done, created_at, done_at", title, id)
	var task model.Task
	if err := row.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt); err != nil {
		return model.Task{}, err
	}
	return task, nil
}

func (pr *PostgresRepo) Done(id int) (model.Task, error) {
	row := pr.db.QueryRow("UPDATE tasks SET done = true, done_at = NOW() WHERE id = $1 AND done = false RETURNING id, title, done, created_at, done_at", id)
	var task model.Task
	if err := row.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt); err != nil {
		row2 := pr.db.QueryRow("SELECT * FROM tasks WHERE id = $1", id)
		err := row2.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt)
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
	row := pr.db.QueryRow("UPDATE tasks SET done = false, done_at = NULL WHERE id = $1 AND done = true RETURNING id, title, done, created_at, done_at", id)
	var task model.Task
	if err := row.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt); err != nil {
		row2 := pr.db.QueryRow("SELECT * FROM tasks WHERE id = $1", id)
		err := row2.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt)
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
	row := pr.db.QueryRow("DELETE FROM TASKS WHERE id = $1 RETURNING id, title, done, created_at, done_at", id)
	var task model.Task
	if err := row.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt); err != nil {
		return model.Task{}, err
	}
	return task, nil

}

func (pr *PostgresRepo) Patch(id int, title *string, done *bool) (model.Task, error) {
	if title != nil {
		if *title == "" {
			return model.Task{}, model.ErrEmptyTitle
		}
	}

	query := `UPDATE tasks SET
		title = COALESCE($1, title),
		done = COALESCE ($2, done),
		done_at = CASE
			WHEN $2 = true THEN NOW()
			WHEN $2 = false THEN NULL
			else done_at
		END
	WHERE id = $3
	RETURNING id, title, done, created_at, done_at`

	row := pr.db.QueryRow(query, title, done, id)
	var task model.Task
	if err := row.Scan(&task.ID, &task.Title, &task.Done, &task.CreatedAt, &task.DoneAt); err != nil {
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
