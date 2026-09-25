package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
	"todo/internal/model"

	"github.com/jackc/pgx/v5"
)

type PostgresRepo struct {
	db *sql.DB
}

// NewPostgresRepo получает уже открытую и мигрированную базу (см. NewDB и Migrate)
// и сам больше ничего не создаёт. Реализует и TaskRepo, и ProjectRepo.
func NewPostgresRepo(db *sql.DB) *PostgresRepo {
	return &PostgresRepo{db: db}
}

// taskColumns — порядок колонок, который ожидает scanTask. Все запросы задач идут с алиасом t.
const taskColumns = "t.id, t.title, t.done, t.priority, t.project_id, t.parent_id, t.due_date, t.scheduled_for, " +
	"t.position, t.note, t.created_at, t.done_at, t.updated_at, t.repeat"

// statsJoin добавляет к строке задачи прогресс её подзадач (по индексу tasks(parent_id)).
const statsJoin = ` LEFT JOIN LATERAL (
	SELECT count(*) FILTER (WHERE c.done) AS done, count(*) AS total
	FROM tasks c WHERE c.parent_id = t.id
) s ON true`

// rowScanner — общее у *sql.Row и *sql.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

// queryer — общее у *sql.DB и *sql.Tx.
type queryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func scanTask(row rowScanner, extra ...any) (model.Task, error) {
	var task model.Task
	dest := []any{&task.ID, &task.Title, &task.Done, &task.Priority, &task.ProjectID, &task.ParentID,
		&task.DueDate, &task.ScheduledFor, &task.Position, &task.Note, &task.CreatedAt, &task.DoneAt, &task.UpdatedAt, &task.Repeat}
	err := row.Scan(append(dest, extra...)...)
	return task, err
}

// scanTaskWithStats читает строку из запроса с statsJoin: после колонок задачи идут s.done, s.total.
func scanTaskWithStats(row rowScanner) (model.Task, error) {
	var stats model.Stats
	task, err := scanTask(row, &stats.Done, &stats.Total)
	if err != nil {
		return model.Task{}, err
	}
	task.SubtaskStats = &stats
	return task, nil
}

func (pr *PostgresRepo) CreateTask(ctx context.Context, nt NewTask) (model.Task, error) {
	// новая задача встаёт в конец любого списка, куда попадёт
	query := `INSERT INTO tasks AS t (title, priority, project_id, parent_id, due_date, scheduled_for, note, repeat, position)
		VALUES (@title, @priority, @project_id, @parent_id, @due_date, @scheduled_for, @note, @repeat,
			(SELECT COALESCE(MAX(position), 0) + 1 FROM tasks))
		RETURNING ` + taskColumns
	args := pgx.NamedArgs{
		"title":         nt.Title,
		"priority":      nt.Priority,
		"project_id":    nt.ProjectID,
		"parent_id":     nt.ParentID,
		"due_date":      dateArg(nt.DueDate),
		"scheduled_for": dateArg(nt.ScheduledFor),
		"note":          nt.Note,
		"repeat":        nt.Repeat,
	}
	task, err := scanTask(pr.db.QueryRowContext(ctx, query, args))
	if err != nil {
		return model.Task{}, err
	}
	task.SubtaskStats = &model.Stats{}
	return task, nil
}

func (pr *PostgresRepo) GetTask(ctx context.Context, id int) (model.Task, error) {
	return getTask(ctx, pr.db, id)
}

func getTask(ctx context.Context, q queryer, id int) (model.Task, error) {
	row := q.QueryRowContext(ctx, "SELECT "+taskColumns+", s.done, s.total FROM tasks t"+statsJoin+" WHERE t.id = $1", id)
	task, err := scanTaskWithStats(row)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Task{}, model.ErrNotFound
	}
	return task, err
}

func (pr *PostgresRepo) ListTasks(ctx context.Context, q TaskQuery) ([]model.Task, int, error) {
	args := pgx.NamedArgs{}
	where := "WHERE " + strings.Join(append([]string{"t.parent_id IS NULL"}, filterConds(q.Filter, args)...), " AND ")

	var total int
	if err := pr.db.QueryRowContext(ctx, "SELECT count(*) FROM tasks t "+where, args).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := "SELECT " + taskColumns + ", s.done, s.total FROM tasks t" + statsJoin + " " + where +
		" ORDER BY " + orderBy(q.Sort, q.Desc)
	if q.Limit > 0 {
		query += " LIMIT @limit"
		args["limit"] = q.Limit
	}
	if q.Offset > 0 {
		query += " OFFSET @offset"
		args["offset"] = q.Offset
	}

	rows, err := pr.db.QueryContext(ctx, query, args)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	tasks := []model.Task{}
	for rows.Next() {
		task, err := scanTaskWithStats(rows)
		if err != nil {
			return nil, 0, err
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return tasks, total, nil
}

func (pr *PostgresRepo) Subtasks(ctx context.Context, parentID int) ([]model.Task, error) {
	rows, err := pr.db.QueryContext(ctx,
		"SELECT "+taskColumns+" FROM tasks t WHERE t.parent_id = $1 ORDER BY t.position, t.id", parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := []model.Task{}
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

// PatchTask собирает UPDATE только из присланных полей: по одному именованному аргументу на поле.
// COALESCE тут не подходит — он не отличает «не менять» от «поставить null».
func (pr *PostgresRepo) PatchTask(ctx context.Context, id int, p TaskPatch) (model.Task, error) {
	sets := []string{"updated_at = now()"}
	args := pgx.NamedArgs{"id": id}

	if p.Title != nil {
		sets = append(sets, "title = @title")
		args["title"] = *p.Title
	}
	if p.Done != nil {
		sets = append(sets, "done = @done", "done_at = CASE WHEN @done THEN now() END")
		args["done"] = *p.Done
	}
	if p.Priority != nil {
		sets = append(sets, "priority = @priority")
		args["priority"] = *p.Priority
	}
	if p.ProjectID.Set {
		sets = append(sets, "project_id = @project_id")
		args["project_id"] = p.ProjectID.Value
	}
	if p.ParentID.Set {
		sets = append(sets, "parent_id = @parent_id")
		args["parent_id"] = p.ParentID.Value
	}
	if p.DueDate.Set {
		sets = append(sets, "due_date = @due_date")
		args["due_date"] = dateArg(p.DueDate.Value)
	}
	if p.ScheduledFor.Set {
		sets = append(sets, "scheduled_for = @scheduled_for")
		args["scheduled_for"] = dateArg(p.ScheduledFor.Value)
	}
	if p.Note.Set {
		sets = append(sets, "note = @note")
		args["note"] = p.Note.Value
	}
	if p.Repeat.Set {
		sets = append(sets, "repeat = @repeat")
		args["repeat"] = p.Repeat.Value
	}

	tx, err := pr.db.BeginTx(ctx, nil)
	if err != nil {
		return model.Task{}, err
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(ctx, "UPDATE tasks SET "+strings.Join(sets, ", ")+" WHERE id = @id", args)
	if err != nil {
		return model.Task{}, err
	}
	if n, err := res.RowsAffected(); err != nil {
		return model.Task{}, err
	} else if n == 0 {
		return model.Task{}, model.ErrNotFound
	}

	// подзадачи живут в том же списке, что и родитель
	if p.ProjectID.Set {
		if _, err := tx.ExecContext(ctx, "UPDATE tasks SET project_id = @project_id WHERE parent_id = @id",
			pgx.NamedArgs{"id": id, "project_id": p.ProjectID.Value}); err != nil {
			return model.Task{}, err
		}
	}

	task, err := getTask(ctx, tx, id)
	if err != nil {
		return model.Task{}, err
	}
	return task, tx.Commit()
}

func (pr *PostgresRepo) DeleteTask(ctx context.Context, id int) error {
	res, err := pr.db.ExecContext(ctx, "DELETE FROM tasks WHERE id = $1", id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return model.ErrNotFound
	}
	return nil
}

// ReorderTasks — один UPDATE, то есть одна транзакция. ordinality нумерует с 1, position — с 0.
func (pr *PostgresRepo) ReorderTasks(ctx context.Context, scope TaskFilter, ids []int) error {
	args := pgx.NamedArgs{"ids": ids}
	conds := append([]string{"t.id = v.id", "t.parent_id IS NULL"}, filterConds(scope, args)...)
	_, err := pr.db.ExecContext(ctx, `UPDATE tasks t SET position = v.ord - 1
		FROM unnest(@ids::int[]) WITH ORDINALITY AS v(id, ord)
		WHERE `+strings.Join(conds, " AND "), args)
	return err
}

func (pr *PostgresRepo) PlanDay(ctx context.Context, date model.Date, add, remove []int) error {
	tx, err := pr.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	args := pgx.NamedArgs{"date": date, "add": add, "remove": remove}
	if _, err := tx.ExecContext(ctx, `UPDATE tasks SET scheduled_for = @date, updated_at = now()
		WHERE id = ANY(@add::int[]) AND NOT done AND parent_id IS NULL`, args); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE tasks SET scheduled_for = NULL, updated_at = now()
		WHERE id = ANY(@remove::int[]) AND scheduled_for = @date`, args); err != nil {
		return err
	}
	return tx.Commit()
}

// DoneActivity считает только корневые задачи — так же, как done_today в /day,
// чтобы грид и счётчик «готово» за один день не расходились.
func (pr *PostgresRepo) DoneActivity(ctx context.Context, days DateRange, loc *time.Location) ([]model.DayCount, error) {
	rows, err := pr.db.QueryContext(ctx, `SELECT (done_at AT TIME ZONE @tz)::date AS day, count(*)
		FROM tasks
		WHERE done AND parent_id IS NULL AND done_at >= @from AND done_at < @to
		GROUP BY day ORDER BY day`, pgx.NamedArgs{
		"tz":   loc.String(),
		"from": days.From.Time(loc),
		"to":   days.To.AddDays(1).Time(loc),
	})
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.DayCount{}
	for rows.Next() {
		var dc model.DayCount
		if err := rows.Scan(&dc.Date, &dc.Done); err != nil {
			return nil, err
		}
		out = append(out, dc)
	}
	return out, rows.Err()
}

// filterConds переводит TaskFilter в условия WHERE над алиасом t и дописывает аргументы в args.
// Имена аргументов с префиксом f_, чтобы не столкнуться с аргументами самого запроса.
func filterConds(f TaskFilter, args pgx.NamedArgs) []string {
	var conds []string
	add := func(cond, name string, v any) {
		conds = append(conds, cond)
		args[name] = v
	}
	if f.Done != nil {
		add("t.done = @f_done", "f_done", *f.Done)
	}
	if f.ProjectID != nil {
		add("t.project_id = @f_project_id", "f_project_id", *f.ProjectID)
	}
	if f.Inbox {
		conds = append(conds, "t.project_id IS NULL")
	}
	if f.ScheduledOn != nil {
		add("t.scheduled_for = @f_scheduled_on", "f_scheduled_on", *f.ScheduledOn)
	}
	if f.NotScheduledOn != nil {
		add("t.scheduled_for IS DISTINCT FROM @f_not_scheduled_on::date", "f_not_scheduled_on", *f.NotScheduledOn)
	}
	if f.ScheduledBefore != nil {
		add("t.scheduled_for < @f_scheduled_before", "f_scheduled_before", *f.ScheduledBefore)
	}
	if f.DueBefore != nil {
		add("t.due_date < @f_due_before", "f_due_before", *f.DueBefore)
	}
	if r := f.DueBetween; r != nil {
		conds = append(conds, "t.due_date BETWEEN @f_due_from AND @f_due_to")
		args["f_due_from"], args["f_due_to"] = r.From, r.To
	}
	if r := f.AnyDateBetween; r != nil {
		conds = append(conds, "(t.due_date BETWEEN @f_any_from AND @f_any_to OR t.scheduled_for BETWEEN @f_any_from AND @f_any_to)")
		args["f_any_from"], args["f_any_to"] = r.From, r.To
	}
	if f.NoDates {
		conds = append(conds, "t.due_date IS NULL", "t.scheduled_for IS NULL")
	}
	if r := f.CreatedBetween; r != nil {
		conds = append(conds, "t.created_at >= @f_created_from AND t.created_at < @f_created_to")
		args["f_created_from"], args["f_created_to"] = r.From, r.To
	}
	if r := f.DoneBetween; r != nil {
		conds = append(conds, "t.done_at >= @f_done_from AND t.done_at < @f_done_to")
		args["f_done_from"], args["f_done_to"] = r.From, r.To
	}
	if f.UpdatedBefore != nil {
		add("t.updated_at < @f_updated_before", "f_updated_before", *f.UpdatedBefore)
	}
	return conds
}

// orderBy — сортировка по белому списку полей. Пустые даты всегда в конце,
// при равенстве — ручной порядок.
func orderBy(sort SortField, desc bool) string {
	dir := "ASC"
	if desc {
		dir = "DESC"
	}
	switch sort {
	case SortPriority:
		return fmt.Sprintf("CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END %s, t.position, t.id", dir)
	case SortDueDate, SortCreatedAt, SortDoneAt, SortUpdatedAt, SortScheduledFor:
		return fmt.Sprintf("t.%s %s NULLS LAST, t.position, t.id", sort, dir)
	default:
		return fmt.Sprintf("t.position %s, t.id %s", dir, dir)
	}
}

// dateArg превращает отсутствующую дату в честный NULL: типизированный nil-указатель
// драйвер не обязан считать NULL-ом.
func dateArg(d *model.Date) any {
	if d == nil {
		return nil
	}
	return *d
}
