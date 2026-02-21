package transport

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"todo/internal/model"
	"todo/internal/service"
	"todo/internal/storage"
)

func http_info() (*Handler, *storage.FakeRepo) {
	repo := &storage.FakeRepo{
		Tasks: []model.Task{
			{ID: 1, Title: "Task 1", Done: false},
			{ID: 2, Title: "Task 2", Done: true},
		},
	}
	service, err := service.NewTaskService(repo)
	if err != nil {
		panic(err)
	}
	h := NewHandler(service)
	return h, repo
}

func TestGETTodos(t *testing.T) {
	h, _ := http_info()

	req := httptest.NewRequest(http.MethodGet, "/todos", nil) // Создаем новый HTTP-запрос с методом GET и URL "/todos". Тело запроса устанавливается в nil, так как для GET-запроса обычно не требуется тело.
	rec := httptest.NewRecorder()                             // Создаем новый HTTP-ответ, который будет использоваться для записи ответа от обработчика. Recorder позволяет нам захватывать и анализировать ответ, который будет отправлен клиенту.

	h.Todos(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	if rec.Header().Get("Content-Type") != "application/json" { //проверяем что в заголовке Content-Type стоит application/json
		t.Fatalf("expected Content-Type application/json, got %s", rec.Header().Get("Content-Type"))
	}

	var listResponse ListToDosResponse //создаем пустую структуру для распаковки ответа

	err := json.Unmarshal(rec.Body.Bytes(), &listResponse)
	if err != nil {
		t.Fatalf("failed to unmarshal response body: %v", err)
	}

	if len(listResponse.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(listResponse.Items))
	}

	if listResponse.Total != 2 {
		t.Fatalf("expected total 2, got %d", listResponse.Total)
	}

	if listResponse.Items[0].ID != 1 || listResponse.Items[0].Title != "Task 1" || listResponse.Items[0].Done != false {
		t.Fatalf("unexpected first item: %+v", listResponse.Items[0])
	}
}

// func TestPostTodo(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		List: []model.Task{},
// 	}
// 	service := service.NewFakeTaskService(store)
// 	h := NewHandler(service)

// 	body := `{"title": ""}`
// 	reader := strings.NewReader(body) // Создаем новый io.Reader, который читает из строки body. Это позволяет нам передать JSON-объект с некорректным полем "title" в тело POST-запроса для тестирования обработки ошибок.

// 	req := httptest.NewRequest(http.MethodPost, "/todos", reader) // Создаем новый HTTP-запрос с методом POST и URL "/todos". Тело запроса содержит JSON-объект с полем "title", установленным в пустую строку. Это позволяет нам протестировать, как обработчик обрабатывает POST-запросы с некорректными данными.
// 	rec := httptest.NewRecorder()

// 	h.Todos(rec, req) // Вызываем метод Todos обработчика, передавая ему созданные запрос и ответ. Это позволяет нам протестировать, как обработчик обрабатывает POST-запросы на URL "/todos".

// 	if rec.Code != http.StatusBadRequest {
// 		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
// 	}

// 	ct := rec.Header().Get("Content-Type")

// 	if ct != "application/json" { //проверяем что в заголовке Content-Type стоит application/json
// 		t.Fatalf("expected Content-Type application/json, got %s", rec.Header().Get("Content-Type"))
// 	}

// 	var ErrResponse ErrorResponse

// 	err := json.Unmarshal(rec.Body.Bytes(), &ErrResponse)
// 	if err != nil {
// 		t.Fatalf("failed to unmarshal response body: %v", err)
// 	}

// 	if ErrResponse.Code != "EMPTY_TITLE" {
// 		t.Fatalf("expected error code EMPTY_TITLE, got %s", ErrResponse.Code)
// 	}

// 	tasks, err := store.Load()
// 	if err != nil {
// 		t.Fatalf("failed to load tasks")
// 	}

// 	for _, ts := range tasks {
// 		if ts.ID != 1 {
// 			t.Fatalf("expected id task 1, got %d", ts.ID)
// 		}
// 	}

// }

// func TestDeleteToDo(t *testing.T) {
// 	h, store := http_info()

// 	req := httptest.NewRequest(http.MethodDelete, "/todos/1", nil)
// 	rec := httptest.NewRecorder()

// 	h.Todos(rec, req)

// 	if rec.Code != http.StatusNoContent {
// 		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rec.Code)
// 	}

// 	tasks, err := store.Load()
// 	if err != nil {
// 		t.Fatalf("failed to load tasks")
// 	}

// 	for _, ts := range tasks {
// 		if ts.ID == 1 {
// 			t.Fatalf("expected id tasks 1, got %d", ts.ID)
// 		}
// 	}

// }

// func TestSetDone(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		List: []model.Task{
// 			{ID: 1, Title: "Task 1", Done: false},
// 			{ID: 2, Title: "Task 2", Done: true},
// 		},
// 	}
// 	service := service.NewFakeTaskService(store)
// 	h := NewHandler(service)

// 	req := httptest.NewRequest(http.MethodPut, "/todos/1/done", nil)
// 	rec := httptest.NewRecorder()

// 	h.Todos(rec, req)

// 	if rec.Code != http.StatusNoContent {
// 		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rec.Code)
// 	}

// 	tasks, err := store.Load()
// 	if err != nil {
// 		t.Fatalf("failed to load tasks")
// 	}

// 	for _, ts := range tasks {
// 		if ts.ID == 1 {
// 			if !ts.Done {
// 				t.Fatalf("expected task 1 to be done, got %v", ts.Done)
// 			}
// 			if ts.DoneAt == nil {
// 				t.Fatalf("expected task 1 to have DoneAt set, got nil")
// 			}
// 		}
// 	}
// }

// func TestSetDoneabc(t *testing.T) {
// 	store := &storage.FakeStorage{
// 		List: []model.Task{
// 			{ID: 1, Title: "Task 1", Done: false},
// 			{ID: 2, Title: "Task 2", Done: true},
// 		},
// 	}
// 	service := service.NewFakeTaskService(store)
// 	h := NewHandler(service)

// 	req := httptest.NewRequest(http.MethodPut, "/todos/1/abc", nil)
// 	rec := httptest.NewRecorder()

// 	h.Todos(rec, req)

// 	if rec.Code != http.StatusBadRequest {
// 		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rec.Code)
// 	}

// 	tasks, err := store.Load()
// 	if err != nil {
// 		t.Fatalf("failed to load tasks: %v", err)
// 	}

// 	for _, ts := range tasks {
// 		if ts.ID == 1 {
// 			if ts.Done {
// 				t.Fatalf("expected task 1 to be undone, got %v", ts.Done)
// 			}
// 			if ts.DoneAt != nil {
// 				t.Fatalf("expected task 1 to not have DoneAt set, got not nil")
// 			}
// 		}
// 	}
// }
