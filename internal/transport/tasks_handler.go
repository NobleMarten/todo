package transport

import (
	"fmt"
	"net/http"
	"todo/internal/model"
	"todo/internal/service"
	"todo/internal/storage"
)

type CreateTaskRequest struct {
	Title        string      `json:"title"`
	Priority     string      `json:"priority"`
	ProjectID    *int        `json:"project_id"`
	ParentID     *int        `json:"parent_id"`
	DueDate      *model.Date `json:"due_date"`
	ScheduledFor *model.Date `json:"scheduled_for"`
}

// PatchTaskRequest: отсутствующий ключ — не трогать, null — очистить (см. model.Opt).
type PatchTaskRequest struct {
	Title        model.Opt[string]     `json:"title"`
	Done         model.Opt[bool]       `json:"done"`
	Priority     model.Opt[string]     `json:"priority"`
	ProjectID    model.Opt[int]        `json:"project_id"`
	ParentID     model.Opt[int]        `json:"parent_id"`
	DueDate      model.Opt[model.Date] `json:"due_date"`
	ScheduledFor model.Opt[model.Date] `json:"scheduled_for"`
	Note         model.Opt[string]     `json:"note"`
}

type ReorderTasksRequest struct {
	Scope service.ReorderScope `json:"scope"`
	IDs   []int                `json:"ids"`
}

// TaskDetailResponse — ответ GET /tasks/{id}: subtasks всегда есть, пусть и пустым массивом
// (в model.Task у него omitempty, чтобы не светиться в списках).
type TaskDetailResponse struct {
	model.Task
	Subtasks []model.Task `json:"subtasks"`
}

type ListTasksResponse struct {
	Items []model.Task `json:"items"`
	Total int          `json:"total"`
}

// notNull — у title/done/priority нет «пустого» значения, null для них — ошибка запроса.
func notNull[T any](o model.Opt[T], field string) (*T, error) {
	if o.Set && o.Value == nil {
		return nil, fmt.Errorf("%w: %s cannot be null", model.ErrInvalidBody, field)
	}
	return o.Value, nil
}

func (req PatchTaskRequest) toPatch() (storage.TaskPatch, error) {
	title, err := notNull(req.Title, "title")
	if err != nil {
		return storage.TaskPatch{}, err
	}
	done, err := notNull(req.Done, "done")
	if err != nil {
		return storage.TaskPatch{}, err
	}
	priority, err := notNull(req.Priority, "priority")
	if err != nil {
		return storage.TaskPatch{}, err
	}
	return storage.TaskPatch{
		Title:        title,
		Done:         done,
		Priority:     priority,
		ProjectID:    req.ProjectID,
		ParentID:     req.ParentID,
		DueDate:      req.DueDate,
		ScheduledFor: req.ScheduledFor,
		Note:         req.Note,
	}, nil
}

func parseListQuery(r *http.Request) (service.ListQuery, error) {
	q := r.URL.Query()
	lq := service.ListQuery{
		View:  q.Get("view"),
		Sort:  q.Get("sort"),
		Order: q.Get("order"),
	}
	var err error
	if lq.ProjectID, err = queryInt(q, "project_id"); err != nil {
		return lq, err
	}
	if lq.Done, err = queryBool(q, "done"); err != nil {
		return lq, err
	}
	if lq.From, err = queryDate(q, "from"); err != nil {
		return lq, err
	}
	if lq.To, err = queryDate(q, "to"); err != nil {
		return lq, err
	}
	if lq.Today, err = queryDate(q, "today"); err != nil {
		return lq, err
	}
	limit, err := queryInt(q, "limit")
	if err != nil {
		return lq, err
	}
	if limit != nil {
		lq.Limit = *limit
	}
	offset, err := queryInt(q, "offset")
	if err != nil {
		return lq, err
	}
	if offset != nil {
		lq.Offset = *offset
	}
	return lq, nil
}

// ListTasks — GET /tasks?view=...: только корневые задачи, total посчитан до пагинации.
func (h *Handler) ListTasks(w http.ResponseWriter, r *http.Request) {
	lq, err := parseListQuery(r)
	if err != nil {
		WriteError(w, err)
		return
	}
	items, total, err := h.tasks.List(r.Context(), lq)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ListTasksResponse{Items: items, Total: total})
}

// GetTask — GET /tasks/{id}: задача вместе с подзадачами.
func (h *Handler) GetTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		WriteError(w, err)
		return
	}
	task, err := h.tasks.Get(r.Context(), id)
	if err != nil {
		WriteError(w, err)
		return
	}
	subtasks := task.Subtasks
	if subtasks == nil {
		subtasks = []model.Task{}
	}
	writeJSON(w, http.StatusOK, TaskDetailResponse{Task: task, Subtasks: subtasks})
}

func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	var req CreateTaskRequest
	if err := decodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	task, err := h.tasks.Add(r.Context(), storage.NewTask{
		Title:        req.Title,
		Priority:     req.Priority,
		ProjectID:    req.ProjectID,
		ParentID:     req.ParentID,
		DueDate:      req.DueDate,
		ScheduledFor: req.ScheduledFor,
	})
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, task)
}

func (h *Handler) PatchTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		WriteError(w, err)
		return
	}
	var req PatchTaskRequest
	if err := decodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	patch, err := req.toPatch()
	if err != nil {
		WriteError(w, err)
		return
	}
	task, err := h.tasks.Patch(r.Context(), id, patch)
	if err != nil {
		WriteError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (h *Handler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		WriteError(w, err)
		return
	}
	if err := h.tasks.Delete(r.Context(), id); err != nil {
		WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ReorderTasks(w http.ResponseWriter, r *http.Request) {
	var req ReorderTasksRequest
	if err := decodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	if err := h.tasks.Reorder(r.Context(), req.Scope, req.IDs); err != nil {
		WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
