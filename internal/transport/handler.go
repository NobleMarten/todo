package transport

import (
	"encoding/json"
	"net/http"
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
