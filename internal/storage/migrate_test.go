package storage

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"
	"todo/internal/model"

	"github.com/pressly/goose/v3"
)

// openTestSchema создаёт одноразовую схему и возвращает базу, у которой search_path
// смотрит только в неё: миграции и down не могут задеть настоящие таблицы в public.
// Запускается только при заданной TEST_DB_URL.
func openTestSchema(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DB_URL")
	if dsn == "" {
		t.Skip("TEST_DB_URL не задана")
	}

	admin, err := NewDB(dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("test_migrate_%d", time.Now().UnixNano())
	if _, err := admin.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec("DROP SCHEMA " + schema + " CASCADE")
		_ = admin.Close()
	})

	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema) // pgx передаёт неизвестные параметры как runtime-параметры
	u.RawQuery = q.Encode()

	db, err := NewDB(u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestMigrate_LegacyDataSurvivesUpDownUp(t *testing.T) {
	db := openTestSchema(t)

	// схема до goose: как в db/init.sql, с данными «на сегодня» в daily
	mustExec(t, db, `CREATE TABLE tasks (
		id         SERIAL      PRIMARY KEY,
		title      TEXT        NOT NULL,
		done       BOOLEAN     NOT NULL DEFAULT false,
		priority   VARCHAR(10) NOT NULL DEFAULT 'low',
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		done_at    TIMESTAMPTZ,
		daily      DATE
	)`)
	mustExec(t, db, `INSERT INTO tasks (title, priority, daily) VALUES
		('на сегодня', 'high', '2026-09-21'),
		('просто задача', 'low', NULL)`)

	if err := Migrate(db); err != nil {
		t.Fatalf("up: %v", err)
	}
	assertMigrated(t, db)

	// повторный запуск на уже мигрированной базе — no-op
	if err := Migrate(db); err != nil {
		t.Fatalf("second up: %v", err)
	}

	if err := goose.DownTo(db, ".", 0); err != nil {
		t.Fatalf("down: %v", err)
	}
	var daily sql.NullString
	if err := db.QueryRow(`SELECT daily::text FROM tasks WHERE title = 'на сегодня'`).Scan(&daily); err != nil {
		t.Fatalf("после down колонки daily нет: %v", err)
	}
	if daily.String != "2026-09-21" {
		t.Fatalf("после down daily = %q", daily.String)
	}
	var projectsTable sql.NullString
	mustScan(t, db, `SELECT to_regclass('projects')::text`, &projectsTable)
	if projectsTable.Valid {
		t.Fatal("после down таблица projects осталась")
	}

	if err := Migrate(db); err != nil {
		t.Fatalf("up again: %v", err)
	}
	assertMigrated(t, db)
}

func TestMigrate_EmptyDatabase(t *testing.T) {
	db := openTestSchema(t)

	// tasks нет вовсе: миграции должны её создать
	if err := Migrate(db); err != nil {
		t.Fatalf("up: %v", err)
	}
	repo := NewPostgresRepo(db)
	task, err := repo.Create("первая", "medium")
	if err != nil {
		t.Fatal(err)
	}
	if task.ScheduledFor != nil || task.DueDate != nil || task.ProjectID != nil {
		t.Fatalf("новая задача с неожиданными полями: %+v", task)
	}
}

func assertMigrated(t *testing.T, db *sql.DB) {
	t.Helper()
	repo := NewPostgresRepo(db)
	tasks, err := repo.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 2 {
		t.Fatalf("задач %d, want 2", len(tasks))
	}
	today := tasks[0]
	if today.ScheduledFor == nil || *today.ScheduledFor != model.NewDate(2026, 9, 21) {
		t.Fatalf("scheduled_for = %v, want 2026-09-21", today.ScheduledFor)
	}
	if tasks[1].ScheduledFor != nil {
		t.Fatalf("scheduled_for второй задачи = %v, want nil", tasks[1].ScheduledFor)
	}
	for _, task := range tasks {
		if task.Position != task.ID {
			t.Fatalf("position = %d, want id %d", task.Position, task.ID)
		}
		if task.ProjectID != nil {
			t.Fatalf("задача %d не во «Входящих»: project_id = %d", task.ID, *task.ProjectID)
		}
	}

	var projects int
	mustScan(t, db, `SELECT count(*) FROM projects`, &projects)
	if projects != 6 {
		t.Fatalf("списков %d, want 6", projects)
	}
}

func mustExec(t *testing.T, db *sql.DB, q string) {
	t.Helper()
	if _, err := db.Exec(q); err != nil {
		t.Fatal(err)
	}
}

func mustScan(t *testing.T, db *sql.DB, q string, dest any) {
	t.Helper()
	if err := db.QueryRow(q).Scan(dest); err != nil {
		t.Fatal(err)
	}
}
