package transport

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"todo/internal/model"
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

func (h *Handler) Todos(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.GetTodos(w, r)
	case http.MethodPost:
		h.PostTodo(w, r)
	case http.MethodDelete:
		h.DeleteTodo(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) GetTodos(w http.ResponseWriter, r *http.Request) {
	// Логика обработки запроса на получение списка задач.
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tasks, err := h.svc.List()
	if err != nil {
		http.Error(w, "Failed to load tasks", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json") // Устанавливаем заголовок Content-Type в ответе.

	if err := json.NewEncoder(w).Encode(tasks); err != nil { // Кодируем задачи в JSON и записываем их в ответ.
		http.Error(w, "Failed to encode tasks", http.StatusInternalServerError)
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
		if errors.Is(err, model.ErrEmptyTitle) {
			http.Error(w, "Title cannot be empty", http.StatusBadRequest)
			return
		}
		http.Error(w, "Failed to add task", http.StatusBadRequest)
		return
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

	idStr := r.URL.Query().Get("id")
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
		if errors.Is(err, model.ErrNotFound) {
			http.Error(w, "Task not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete task", http.StatusInternalServerError)
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
		if errors.Is(err, model.ErrNotFound) {
			http.Error(w, "Task not found", http.StatusNotFound) //ошибка 404
			return
		} else if errors.Is(err, model.ErrAlreadyDone) || errors.Is(err, model.ErrNotDone) {
			http.Error(w, err.Error(), http.StatusBadRequest) //ошибка 400
			return
		} else {
			http.Error(w, "Failed to update task status", http.StatusInternalServerError) //ошибка 500
			return
		}
	}

	w.WriteHeader(http.StatusNoContent) // 204 No Content
}
