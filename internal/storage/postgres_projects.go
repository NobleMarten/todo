package storage

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"todo/internal/model"

	"github.com/jackc/pgx/v5"
)

const projectColumns = "p.id, p.name, p.color, p.position, p.archived, p.created_at"

func scanProject(row rowScanner) (model.Project, error) {
	var p model.Project
	err := row.Scan(&p.ID, &p.Name, &p.Color, &p.Position, &p.Archived, &p.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Project{}, model.ErrProjectNotFound
	}
	return p, err
}

// ListProjects считает только корневые невыполненные задачи — как их видно в самих списках.
func (pr *PostgresRepo) ListProjects(ctx context.Context, includeArchived bool, today model.Date) ([]model.Project, error) {
	rows, err := pr.db.QueryContext(ctx, `SELECT `+projectColumns+`,
			count(t.id) FILTER (WHERE NOT t.done),
			count(t.id) FILTER (WHERE NOT t.done AND t.due_date < @today)
		FROM projects p
		LEFT JOIN tasks t ON t.project_id = p.id AND t.parent_id IS NULL
		WHERE @all::boolean OR NOT p.archived
		GROUP BY p.id
		ORDER BY p.position, p.id`, pgx.NamedArgs{"all": includeArchived, "today": today})
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []model.Project{}
	for rows.Next() {
		var p model.Project
		var c model.ProjectCounts
		if err := rows.Scan(&p.ID, &p.Name, &p.Color, &p.Position, &p.Archived, &p.CreatedAt, &c.Active, &c.Overdue); err != nil {
			return nil, err
		}
		p.Counts = &c
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func (pr *PostgresRepo) GetProject(ctx context.Context, id int) (model.Project, error) {
	return scanProject(pr.db.QueryRowContext(ctx, "SELECT "+projectColumns+" FROM projects p WHERE p.id = $1", id))
}

func (pr *PostgresRepo) CreateProject(ctx context.Context, name, color string) (model.Project, error) {
	return scanProject(pr.db.QueryRowContext(ctx, `INSERT INTO projects AS p (name, color, position)
		VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1 FROM projects))
		RETURNING `+projectColumns, name, color))
}

func (pr *PostgresRepo) PatchProject(ctx context.Context, id int, patch ProjectPatch) (model.Project, error) {
	var sets []string
	args := pgx.NamedArgs{"id": id}
	if patch.Name != nil {
		sets = append(sets, "name = @name")
		args["name"] = *patch.Name
	}
	if patch.Color != nil {
		sets = append(sets, "color = @color")
		args["color"] = *patch.Color
	}
	if patch.Archived != nil {
		sets = append(sets, "archived = @archived")
		args["archived"] = *patch.Archived
	}
	if len(sets) == 0 {
		return model.Project{}, model.ErrNothingToUpdate
	}
	return scanProject(pr.db.QueryRowContext(ctx,
		"UPDATE projects AS p SET "+strings.Join(sets, ", ")+" WHERE p.id = @id RETURNING "+projectColumns, args))
}

// DeleteProject: задачи списка уходят во «Входящие» через ON DELETE SET NULL.
func (pr *PostgresRepo) DeleteProject(ctx context.Context, id int) error {
	res, err := pr.db.ExecContext(ctx, "DELETE FROM projects WHERE id = $1", id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return model.ErrProjectNotFound
	}
	return nil
}

func (pr *PostgresRepo) ReorderProjects(ctx context.Context, ids []int) error {
	_, err := pr.db.ExecContext(ctx, `UPDATE projects p SET position = v.ord - 1
		FROM unnest(@ids::int[]) WITH ORDINALITY AS v(id, ord)
		WHERE p.id = v.id`, pgx.NamedArgs{"ids": ids})
	return err
}
