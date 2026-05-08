package transport

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"todo/internal/model"
)

type TaskService interface {
	List(ctx context.Context) ([]model.Task, error)
	GetByID(id int) (model.Task, error)
	Add(title string, priority string) (model.Task, error)
	Delete(id int) (model.Task, error)
	Update(id int, title string) (model.Task, error)
	Done(id int) (model.Task, error)
	Undone(id int) (model.Task, error)
	Patch(id int, title *string, done *bool, priority *string) (model.Task, error)
	Clear() error
	FilterByDate(tasks []model.Task, from, to time.Time) ([]model.Task, error)
	FilterByDone(tasks []model.Task, done bool) ([]model.Task, error)
	SortTasks(tasks []model.Task, sortBy string, order string) ([]model.Task, error)
	Paginate(tasks []model.Task, limit, offset int) ([]model.Task, error)
}

// Handler представляет собой структуру, которая содержит ссылку на сервис TaskService.
type Handler struct {
	svc TaskService // Поле svc хранит указатель на экземпляр TaskService.
}

type AddTodoRequest struct {
	Title    string `json:"title"`
	Priority string `json:"priority,omitempty"`
}

type UpdateTodoRequest struct {
	Title string `json:"title"`
}

type PatchTodoRequest struct {
	Title    *string `json:"title,omitempty"`
	Done     *bool   `json:"done,omitempty"`
	Priority *string `json:"priority,omitempty"`
}

type ListToDosResponse struct {
	Items  []model.Task `json:"items"`
	Total  int          `json:"total"`
	Limit  int          `json:"limit,omitempty"`
	Offset int          `json:"offset,omitempty"`
}

type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// NewHandler создает новый экземпляр Handler, принимая указатель на TaskService.
func NewHandler(svc TaskService) *Handler {
	// Возвращает указатель на новый экземпляр Handler, инициализированный переданным сервисом.
	return &Handler{svc: svc} // *Handler означает, что функция возвращает указатель на Handler.
}

func (h *Handler) Todos(w http.ResponseWriter, r *http.Request) { // (роутинг) Метод Todos обрабатывает HTTP-запросы, связанные с задачами.
	switch r.Method {
	case http.MethodGet:
		h.GetTodos(w, r)
	case http.MethodPost:
		if strings.HasPrefix(r.URL.Path, "/todos/clear") {
			h.ClearTask(w, r)
		} else if r.URL.Path == "/todos" {
			h.PostTodo(w, r)
		} else {
			WriteError(w, model.ErrNotAllowed)
		}
	case http.MethodDelete:
		h.DeleteTodo(w, r)
	case http.MethodPatch:
		if strings.HasPrefix(r.URL.Path, "/todos/") {
			h.PatchTodo(w, r)
		} else {
			WriteError(w, model.ErrNotAllowed)
		}
	case http.MethodPut:
		if strings.HasSuffix(r.URL.Path, "/done") || strings.HasSuffix(r.URL.Path, "/undone") {
			h.SetDone(w, r)
		} else if strings.HasPrefix(r.URL.Path, "/todos/") {
			h.UpdTodo(w, r)
		} else {
			WriteError(w, model.ErrNotAllowed)
		}
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) GetTodos(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tasks, err := h.svc.List(ctx)
	if err != nil {
		http.Error(w, "Failed to load tasks", http.StatusInternalServerError)
		return
	}

	if strings.HasPrefix(r.URL.Path, "/todos/") {
		h.Getid(w, r)
		return
	} else if r.URL.Path == "/todos" {
		// Parse query parameters for filtering, sorting, and pagination
		from, to, ok, err := ParseDate(r)
		if err != nil {
			http.Error(w, "Invalid from or to parameter", http.StatusBadRequest) // ошибка 400
			return
		}
		if ok {
			tasks, err = h.svc.FilterByDate(tasks, from, to)

			if err != nil {
				http.Error(w, "Failed to filter tasks", http.StatusInternalServerError) // ошибка 500
				return
			}
		}

		done, ok, err := ParseDone(r)
		if err != nil {
			http.Error(w, "Invalid done parameter", http.StatusBadRequest) // ошибка 400
			return
		}
		if ok {
			tasks, err = h.svc.FilterByDone(tasks, done)

			if err != nil {
				http.Error(w, "Failed to filter tasks", http.StatusInternalServerError) // ошибка 500
				return
			}

		}

		sortBy, order, ok, err := SortParse(r)
		if err != nil {
			http.Error(w, "Invalid sort or order parameter", http.StatusBadRequest) // ошибка 400
			return
		}
		if ok {
			tasks, err = h.svc.SortTasks(tasks, sortBy, order)
			if err != nil {
				http.Error(w, "Failed to sort tasks", http.StatusInternalServerError) // ошибка 500
				return
			}
		}

		total := len(tasks)
		limit, offset := 0, 0

		l, o, ok, err := ParsePaginate(r)
		if err != nil {
			http.Error(w, "Invalid limit or offset parameter", http.StatusBadRequest) // ошибка 400
			return
		}
		if ok {
			limit, offset = l, o
			tasks, err = h.svc.Paginate(tasks, limit, offset)
			if err != nil {
				http.Error(w, "Failed to paginate tasks", http.StatusInternalServerError)
				return
			}
		}

		resp := ListToDosResponse{ // Формируем ответ с задачами и метаданными.
			Items:  tasks,
			Total:  total,
			Limit:  limit,
			Offset: offset,
		}

		w.Header().Set("Content-Type", "application/json") // Устанавливаем заголовок Content-Type в ответе.

		if err := json.NewEncoder(w).Encode(resp); err != nil { // Кодируем ответ в JSON и записываем их в ответ.
			http.Error(w, "Failed to encode resp", http.StatusInternalServerError)
			return
		}
	} else {
		http.Error(w, "Not found", http.StatusNotFound) // ошибка 404
		return
	}
}

func (h *Handler) Getid(w http.ResponseWriter, r *http.Request) {
	// Логика обработки запроса на получение задачи по ID.
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed) // ошибка 405
		return
	}

	path := r.URL.Path
	idStr := strings.TrimPrefix(path, "/todos/")
	if idStr == "" {
		http.Error(w, "Missing id path", http.StatusBadRequest) // ошибка 400
		return
	}
	idInt, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid id parameter", http.StatusBadRequest) // ошибка 400
		return
	}

	task, err := h.svc.GetByID(idInt)
	if err != nil {
		WriteError(w, err) // Используем функцию WriteError для обработки ошибок.
		return
	}

	w.Header().Set("Content-Type", "application/json")      // Устанавливаем заголовок Content-Type в ответе.
	if err := json.NewEncoder(w).Encode(task); err != nil { // Кодируем задачи в JSON и записываем их в ответ.
		http.Error(w, "Failed to encode task", http.StatusInternalServerError)
		return
	}
}

func (h *Handler) PostTodo(w http.ResponseWriter, r *http.Request) {
	// Логика обработки запроса на добавление новой задачи.
	log.Println("PostTodo called", r.Method, r.URL.Path)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req AddTodoRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, err)
		return
	}

	task, err := h.svc.Add(req.Title, req.Priority)
	if err != nil {
		WriteError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	if err := json.NewEncoder(w).Encode(task); err != nil {
		// http.Error(w, "Failed to encode task", http.StatusInternalServerError) // ошибка 500
		WriteError(w, err)
		return
	}
}

func (h *Handler) DeleteTodo(w http.ResponseWriter, r *http.Request) {
	// Логика обработки запроса на удаление задачи.

	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := strings.TrimPrefix(r.URL.Path, "/todos/")

	if idStr == "" {
		http.Error(w, "Missing id parameter", http.StatusBadRequest)
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		WriteError(w, err)
		return
	}

	_, err = h.svc.Delete(id)
	if err != nil {
		WriteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent) // 204 No Content
}

func (h *Handler) SetDone(w http.ResponseWriter, r *http.Request) {
	// Логика обработки запроса на установку задачи как выполненной.
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed) //ошибка 405
		return
	}

	idStr := strings.Split(strings.TrimPrefix(r.URL.Path, "/todos/"), "/")[0]
	if idStr == "" {
		http.Error(w, "Missing id parameter", http.StatusBadRequest) //ошибка 400
		return
	}

	action := strings.Split(strings.TrimPrefix(r.URL.Path, "/todos/"), "/")[1]
	if action == "" {
		http.Error(w, "Missing done parameter", http.StatusBadRequest) //ошибка 400
		return
	}

	// распарсим id
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid id parameter", http.StatusBadRequest) //ошибка 400
		return
	}

	if action == "done" {
		_, err = h.svc.Done(id)
		if err != nil {
			WriteError(w, err)
			return
		}
	}
	if action == "undone" {
		_, err = h.svc.Undone(id)
		if err != nil {
			WriteError(w, err)
			return
		}
	}
	if (action != "done") && (action != "undone") {
		http.Error(w, "Invalid action parameter", http.StatusBadRequest)
	}

	w.WriteHeader(http.StatusNoContent) // 204 No Content
}

func (h *Handler) UpdTodo(w http.ResponseWriter, r *http.Request) {
	// Логика обработки запроса на обновление задачи.
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := strings.TrimPrefix(r.URL.Path, "/todos/")
	if idStr == "" {
		http.Error(w, "Missing id path", http.StatusBadRequest)
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid id parameter", http.StatusBadRequest)
		return
	}

	var req UpdateTodoRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body(json)", http.StatusBadRequest)
		return
	}

	task, err := h.svc.Update(id, req.Title)
	if err != nil {
		WriteError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(task); err != nil {
		http.Error(w, "Failed to encode task", http.StatusInternalServerError) // ошибка 500
		return
	}
}

func (h *Handler) PatchTodo(w http.ResponseWriter, r *http.Request) {
	// Логика обработки запроса на добавление новой задачи (done и title)
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PatchTodoRequest

	idStr := strings.TrimPrefix(r.URL.Path, "/todos/")
	if idStr == "" {
		http.Error(w, "Missing id path", http.StatusBadRequest)
		return
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid id parameter", http.StatusBadRequest)
		return
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body(json)", http.StatusBadRequest)
		return
	}

	task, err := h.svc.Patch(id, req.Title, req.Done, req.Priority)
	if err != nil {
		WriteError(w, err)
		return

	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(task); err != nil {
		http.Error(w, "Failed to encode task", http.StatusInternalServerError)
		return
	}
}

func (h *Handler) ClearTask(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, model.ErrNotAllowed)
		return
	}

	err := h.svc.Clear()
	if err != nil {
		WriteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
