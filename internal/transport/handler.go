package transport

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"todo/internal/service"
)

// Handler представляет собой структуру, которая содержит ссылку на сервис TaskService.
type Handler struct {
	svc *service.TaskService // Поле svc хранит указатель на экземпляр TaskService.
}

// NewHandler создает новый экземпляр Handler, принимая указатель на TaskService.
func NewHandler(svc *service.TaskService) *Handler {
	// Возвращает указатель на новый экземпляр Handler, инициализированный переданным сервисом.
	return &Handler{svc: svc} // *Handler означает, что функция возвращает указатель на Handler.
}

func (h *Handler) Todos(w http.ResponseWriter, r *http.Request) { // (роутинг) Метод Todos обрабатывает HTTP-запросы, связанные с задачами.
	switch r.Method {
	case http.MethodGet:
		h.GetTodos(w, r)
	case http.MethodPost:
		h.PostTodo(w, r)
	case http.MethodDelete:
		h.DeleteTodo(w, r)
	case http.MethodPatch:
		if strings.HasPrefix(r.URL.Path, "/todos/") {
			h.PatchTodo(w, r)
		} else {
			http.Error(w, "Not found", http.StatusNotFound)
		}
	case http.MethodPut:
		if strings.HasPrefix(r.URL.Path, "/todos/") {
			h.UpdTodo(w, r)
		} else {
			http.Error(w, "Not found", http.StatusNotFound) // ошибка 404
		}
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) GetTodos(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tasks, err := h.svc.List()
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

		limit, offset, ok, err := ParsePaginate(r)
		if err != nil {
			http.Error(w, "Invalid limit or offset parameter", http.StatusBadRequest) // ошибка 400
			return
		}
		if ok {
			tasks, err = h.svc.Paginate(tasks, limit, offset)
			if err != nil {
				http.Error(w, "Failed to paginate tasks", http.StatusInternalServerError)
				return
			}
		}

		w.Header().Set("Content-Type", "application/json") // Устанавливаем заголовок Content-Type в ответе.

		if err := json.NewEncoder(w).Encode(tasks); err != nil { // Кодируем задачи в JSON и записываем их в ответ.
			http.Error(w, "Failed to encode tasks", http.StatusInternalServerError)
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

type AddTodoRequest struct {
	Title string `json:"title"`
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
		http.Error(w, "Invalid request body(json)", http.StatusBadRequest)
		return
	}

	task, err := h.svc.Add(req.Title)
	if err != nil {
		WriteError(w, err)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	if err := json.NewEncoder(w).Encode(task); err != nil {
		http.Error(w, "Failed to encode task", http.StatusInternalServerError)
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
		http.Error(w, "Invalid id parameter", http.StatusBadRequest)
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

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "Missing id parameter", http.StatusBadRequest) //ошибка 400
		return
	}

	doneStr := r.URL.Query().Get("done")
	if doneStr == "" {
		http.Error(w, "Missing done parameter", http.StatusBadRequest) //ошибка 400
		return
	}

	// распарсим id и done
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid id parameter", http.StatusBadRequest) //ошибка 400
		return
	}

	done, err := strconv.ParseBool(doneStr)
	if err != nil {
		http.Error(w, "Invalid done parameter", http.StatusBadRequest) //ошибка 400
		return
	}

	if done {
		_, err = h.svc.Done(id)
	} else {
		_, err = h.svc.Undone(id)
	}
	if err != nil {
		WriteError(w, err)
	}

	w.WriteHeader(http.StatusNoContent) // 204 No Content
}

type UpdateTodoRequest struct {
	Title string `json:"title"`
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

type PatchTodoRequest struct {
	Title *string `json:"title,omitempty"`
	Done  *bool   `json:"done,omitempty"`
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

	task, err := h.svc.Patch(id, req.Title, req.Done)
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
