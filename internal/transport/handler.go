package transport

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
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
	log.Printf("decoded title=%q\n", req.Title)

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
