package transport

import (
	"context"
	"net/http"
	"todo/internal/model"
	"todo/internal/service"
	"todo/internal/storage"
)

type TaskService interface {
	Add(ctx context.Context, userID int, nt storage.NewTask) (model.Task, error)
	Get(ctx context.Context, userID int, id int) (model.Task, error)
	List(ctx context.Context, userID int, q service.ListQuery) ([]model.Task, int, error)
	Counts(ctx context.Context, userID int, today *model.Date) (map[string]int, error)
	Patch(ctx context.Context, userID int, id int, p storage.TaskPatch) (model.Task, error)
	Delete(ctx context.Context, userID int, id int) error
	Reorder(ctx context.Context, userID int, scope service.ReorderScope, ids []int) error
	Activity(ctx context.Context, userID int, from, to *model.Date) ([]model.DayCount, error)
}

type ProjectService interface {
	List(ctx context.Context, userID int, includeArchived bool, today *model.Date) ([]model.Project, error)
	Create(ctx context.Context, userID int, name, color string) (model.Project, error)
	Patch(ctx context.Context, userID int, id int, p storage.ProjectPatch) (model.Project, error)
	Delete(ctx context.Context, userID int, id int) error
	Reorder(ctx context.Context, userID int, ids []int) error
}

type DayService interface {
	Day(ctx context.Context, userID int, date *model.Date) (service.Day, error)
	Suggestions(ctx context.Context, userID int, date *model.Date) (service.Suggestions, error)
	Week(ctx context.Context, userID int, from *model.Date) (service.Week, error)
	Plan(ctx context.Context, userID int, date model.Date, add, remove []int) error
}

// Handler держит сервисы; сами обработчики разложены по tasks_/projects_/day_handler.go.
type Handler struct {
	tasks    TaskService
	projects ProjectService
	day      DayService
}

func NewHandler(tasks TaskService, projects ProjectService, day DayService) *Handler {
	return &Handler{tasks: tasks, projects: projects, day: day}
}

// NewRouter регистрирует все маршруты API на паттернах ServeMux (Go 1.22+):
// метод и {id} разбирает сам mux, на чужой метод он отвечает 405. Каждый обработчик получает
// пользователя запроса (withUser) и видит только его задачи и списки.
func NewRouter(h *Handler) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /projects", withUser(h.ListProjects))
	mux.HandleFunc("POST /projects", withUser(h.CreateProject))
	mux.HandleFunc("PATCH /projects/{id}", withUser(h.PatchProject))
	mux.HandleFunc("DELETE /projects/{id}", withUser(h.DeleteProject))
	mux.HandleFunc("POST /projects/reorder", withUser(h.ReorderProjects))

	mux.HandleFunc("GET /tasks", withUser(h.ListTasks))
	mux.HandleFunc("GET /tasks/counts", withUser(h.TaskCounts)) // литерал важнее {id} в ServeMux
	mux.HandleFunc("GET /tasks/{id}", withUser(h.GetTask))
	mux.HandleFunc("POST /tasks", withUser(h.CreateTask))
	mux.HandleFunc("PATCH /tasks/{id}", withUser(h.PatchTask))
	mux.HandleFunc("DELETE /tasks/{id}", withUser(h.DeleteTask))
	mux.HandleFunc("POST /tasks/reorder", withUser(h.ReorderTasks))

	mux.HandleFunc("GET /day", withUser(h.GetDay))
	mux.HandleFunc("GET /day/suggestions", withUser(h.GetSuggestions))
	mux.HandleFunc("GET /day/week", withUser(h.GetWeek))
	mux.HandleFunc("POST /day/plan", withUser(h.PlanDay))

	mux.HandleFunc("GET /stats/activity", withUser(h.Activity))

	return mux
}
