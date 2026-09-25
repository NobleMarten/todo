package transport

import (
	"context"
	"net/http"
	"todo/internal/model"
	"todo/internal/service"
	"todo/internal/storage"
)

type TaskService interface {
	Add(ctx context.Context, nt storage.NewTask) (model.Task, error)
	Get(ctx context.Context, id int) (model.Task, error)
	List(ctx context.Context, q service.ListQuery) ([]model.Task, int, error)
	Patch(ctx context.Context, id int, p storage.TaskPatch) (model.Task, error)
	Delete(ctx context.Context, id int) error
	Reorder(ctx context.Context, scope service.ReorderScope, ids []int) error
	Activity(ctx context.Context, from, to *model.Date) ([]model.DayCount, error)
}

type ProjectService interface {
	List(ctx context.Context, includeArchived bool, today *model.Date) ([]model.Project, error)
	Create(ctx context.Context, name, color string) (model.Project, error)
	Patch(ctx context.Context, id int, p storage.ProjectPatch) (model.Project, error)
	Delete(ctx context.Context, id int) error
	Reorder(ctx context.Context, ids []int) error
}

type DayService interface {
	Day(ctx context.Context, date *model.Date) (service.Day, error)
	Suggestions(ctx context.Context, date *model.Date) (service.Suggestions, error)
	Week(ctx context.Context, from *model.Date) (service.Week, error)
	Plan(ctx context.Context, date model.Date, add, remove []int) error
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
// метод и {id} разбирает сам mux, на чужой метод он отвечает 405.
func NewRouter(h *Handler) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /projects", h.ListProjects)
	mux.HandleFunc("POST /projects", h.CreateProject)
	mux.HandleFunc("PATCH /projects/{id}", h.PatchProject)
	mux.HandleFunc("DELETE /projects/{id}", h.DeleteProject)
	mux.HandleFunc("POST /projects/reorder", h.ReorderProjects)

	mux.HandleFunc("GET /tasks", h.ListTasks)
	mux.HandleFunc("GET /tasks/{id}", h.GetTask)
	mux.HandleFunc("POST /tasks", h.CreateTask)
	mux.HandleFunc("PATCH /tasks/{id}", h.PatchTask)
	mux.HandleFunc("DELETE /tasks/{id}", h.DeleteTask)
	mux.HandleFunc("POST /tasks/reorder", h.ReorderTasks)

	mux.HandleFunc("GET /day", h.GetDay)
	mux.HandleFunc("GET /day/suggestions", h.GetSuggestions)
	mux.HandleFunc("GET /day/week", h.GetWeek)
	mux.HandleFunc("POST /day/plan", h.PlanDay)

	mux.HandleFunc("GET /stats/activity", h.Activity)

	return mux
}
