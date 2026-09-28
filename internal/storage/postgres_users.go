package storage

import (
	"context"
	"database/sql"
	"errors"
	"time"
	"todo/internal/model"

	"github.com/jackc/pgx/v5/pgconn"
)

const userColumns = "u.id, u.login, COALESCE(u.password_hash, ''), u.created_at"

func scanUser(row rowScanner, extra ...any) (model.User, error) {
	var u model.User
	err := row.Scan(append([]any{&u.ID, &u.Login, &u.PasswordHash, &u.CreatedAt}, extra...)...)
	return u, err
}

func (pr *PostgresRepo) CreateUser(ctx context.Context, login, passwordHash string) (model.User, error) {
	u, err := scanUser(pr.db.QueryRowContext(ctx,
		"INSERT INTO users AS u (login, password_hash) VALUES ($1, NULLIF($2, '')) RETURNING "+userColumns,
		login, passwordHash))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
		return model.User{}, model.ErrLoginTaken
	}
	return u, err
}

func (pr *PostgresRepo) UserByLogin(ctx context.Context, login string) (model.User, error) {
	u, err := scanUser(pr.db.QueryRowContext(ctx, "SELECT "+userColumns+" FROM users u WHERE u.login = $1", login))
	if errors.Is(err, sql.ErrNoRows) {
		return model.User{}, model.ErrUserNotFound
	}
	return u, err
}

func (pr *PostgresRepo) SetPassword(ctx context.Context, userID int, passwordHash string) error {
	res, err := pr.db.ExecContext(ctx, "UPDATE users SET password_hash = $2 WHERE id = $1", userID, passwordHash)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		return model.ErrUserNotFound
	}
	return nil
}

func (pr *PostgresRepo) ListUsers(ctx context.Context) ([]model.User, error) {
	rows, err := pr.db.QueryContext(ctx, "SELECT "+userColumns+" FROM users u ORDER BY u.id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []model.User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (pr *PostgresRepo) CreateSession(ctx context.Context, userID int, tokenHash []byte, expires time.Time) error {
	tx, err := pr.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, "DELETE FROM sessions WHERE expires_at <= now()"); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
		tokenHash, userID, expires); err != nil {
		return err
	}
	return tx.Commit()
}

func (pr *PostgresRepo) SessionUser(ctx context.Context, tokenHash []byte, now time.Time) (model.User, time.Time, error) {
	var expires time.Time
	u, err := scanUser(pr.db.QueryRowContext(ctx, `SELECT `+userColumns+`, s.expires_at
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.expires_at > $2`, tokenHash, now), &expires)
	if errors.Is(err, sql.ErrNoRows) {
		return model.User{}, time.Time{}, model.ErrUnauthorized
	}
	return u, expires, err
}

func (pr *PostgresRepo) ExtendSession(ctx context.Context, tokenHash []byte, expires time.Time) error {
	_, err := pr.db.ExecContext(ctx, "UPDATE sessions SET expires_at = $2 WHERE token_hash = $1", tokenHash, expires)
	return err
}

func (pr *PostgresRepo) DeleteSession(ctx context.Context, tokenHash []byte) error {
	_, err := pr.db.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash = $1", tokenHash)
	return err
}

func (pr *PostgresRepo) DeleteUserSessions(ctx context.Context, userID int) error {
	_, err := pr.db.ExecContext(ctx, "DELETE FROM sessions WHERE user_id = $1", userID)
	return err
}
