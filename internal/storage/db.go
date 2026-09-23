package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"
	"todo/migrations"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// pingTimeout ограничивает проверку на старте: у pgx нет своего connect timeout,
// и без него при недоступном хосте сервис висит до таймаута TCP в ОС.
const pingTimeout = 5 * time.Second

// NewDB открывает пул соединений с Postgres и сразу проверяет, что база отвечает.
func NewDB(connStr string) (*sql.DB, error) {
	db, err := sql.Open("pgx", connStr)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

// Migrate прогоняет встроенные в бинарник миграции до последней версии.
// Каждая миграция идёт в своей транзакции; уже применённые goose пропускает,
// поэтому повторный запуск на мигрированной базе ничего не делает.
func Migrate(db *sql.DB) error {
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("goose dialect: %w", err)
	}
	if err := goose.Up(db, "."); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}
