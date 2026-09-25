package transport

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"todo/internal/model"
	"todo/internal/service"
	"todo/internal/storage"
)

// newTestServer — настоящий роутер и сервисы поверх FakeRepo.
func newTestServer(t *testing.T) (http.Handler, *storage.FakeRepo) {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		t.Fatal(err)
	}
	repo := &storage.FakeRepo{}
	h := NewHandler(
		service.NewTaskService(repo, repo, loc),
		service.NewProjectService(repo, loc),
		service.NewDayService(repo, loc),
	)
	return NewRouter(h), repo
}

type response struct {
	*httptest.ResponseRecorder
}

func do(t *testing.T, h http.Handler, method, path, body string) response {
	t.Helper()
	return serve(h, newReq(method, path, body))
}

func newReq(method, path, body string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func serve(h http.Handler, req *http.Request) response {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return response{rec}
}

func (r response) decode(t *testing.T, v any) {
	t.Helper()
	if err := json.Unmarshal(r.Body.Bytes(), v); err != nil {
		t.Fatalf("decode %q: %v", r.Body.String(), err)
	}
}

// expect проверяет статус и, если code не пуст, код ошибки в теле.
func (r response) expect(t *testing.T, status int, code string) {
	t.Helper()
	if r.Code != status {
		t.Fatalf("status = %d, want %d; body %s", r.Code, status, r.Body.String())
	}
	if code == "" {
		return
	}
	var e ErrorResponse
	r.decode(t, &e)
	if e.Code != code {
		t.Fatalf("code = %q, want %q (%s)", e.Code, code, e.Message)
	}
}

func createTask(t *testing.T, h http.Handler, body string) model.Task {
	t.Helper()
	res := do(t, h, "POST", "/tasks", body)
	res.expect(t, http.StatusCreated, "")
	var task model.Task
	res.decode(t, &task)
	return task
}

func TestCreateTask(t *testing.T) {
	h, _ := newTestServer(t)

	task := createTask(t, h, `{"title":" докер ","priority":"high","due_date":"2026-10-04"}`)
	if task.ID == 0 || task.Title != "докер" || task.Priority != "high" || task.DueDate.String() != "2026-10-04" {
		t.Fatalf("task = %+v", task)
	}

	tests := []struct {
		name, body string
		status     int
		code       string
	}{
		{"empty title", `{"title":"  "}`, 400, "EMPTY_TITLE"},
		{"too long", `{"title":"` + strings.Repeat("a", 121) + `"}`, 400, "TITLE_TOO_LONG"},
		{"broken json", `{"title":`, 400, "INVALID_BODY"},
		{"empty body", ``, 400, "INVALID_BODY"},
		{"bad date", `{"title":"x","due_date":"04.10.2026"}`, 400, "INVALID_DATE"},
		{"bad priority", `{"title":"x","priority":"urgent"}`, 400, "INVALID_PRIORITY"},
		{"no project", `{"title":"x","project_id":42}`, 404, "PROJECT_NOT_FOUND"},
		{"no parent", `{"title":"x","parent_id":42}`, 404, "TASK_NOT_FOUND"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			do(t, h, "POST", "/tasks", tt.body).expect(t, tt.status, tt.code)
		})
	}
}

func TestGetTask(t *testing.T) {
	h, _ := newTestServer(t)
	parent := createTask(t, h, `{"title":"parent"}`)
	createTask(t, h, `{"title":"sub","parent_id":1}`)

	res := do(t, h, "GET", "/tasks/1", "")
	res.expect(t, 200, "")
	var got model.Task
	res.decode(t, &got)
	if got.ID != parent.ID || len(got.Subtasks) != 1 || got.SubtaskStats == nil || got.SubtaskStats.Total != 1 {
		t.Fatalf("got %+v", got)
	}

	res = do(t, h, "GET", "/tasks/2", "")
	res.expect(t, 200, "")
	if !strings.Contains(res.Body.String(), `"subtasks":[]`) {
		t.Fatalf("у задачи без подзадач нет subtasks: []: %s", res.Body.String())
	}

	do(t, h, "GET", "/tasks/99999999999", "").expect(t, 400, "INVALID_ID")
	do(t, h, "GET", "/tasks/abc", "").expect(t, 400, "INVALID_ID")
	do(t, h, "GET", "/tasks/0", "").expect(t, 400, "INVALID_ID")
	do(t, h, "GET", "/tasks/999", "").expect(t, 404, "TASK_NOT_FOUND")
}

func TestListTasks(t *testing.T) {
	h, _ := newTestServer(t)
	createTask(t, h, `{"title":"a","scheduled_for":"2026-09-21"}`)
	createTask(t, h, `{"title":"b","due_date":"2026-09-20"}`)
	createTask(t, h, `{"title":"c"}`)
	createTask(t, h, `{"title":"sub","parent_id":1}`)

	list := func(t *testing.T, query string) ListTasksResponse {
		t.Helper()
		res := do(t, h, "GET", "/tasks"+query, "")
		res.expect(t, 200, "")
		var out ListTasksResponse
		res.decode(t, &out)
		return out
	}

	all := list(t, "")
	if all.Total != 3 || len(all.Items) != 3 {
		t.Fatalf("all: total %d, items %d", all.Total, len(all.Items))
	}
	if s := all.Items[0].SubtaskStats; s == nil || s.Total != 1 {
		t.Fatalf("subtask_stats = %+v", s)
	}
	if today := list(t, "?view=today&today=2026-09-21"); today.Total != 1 || today.Items[0].Title != "a" {
		t.Fatalf("today = %+v", today)
	}
	if overdue := list(t, "?view=overdue&today=2026-09-21"); overdue.Total != 1 || overdue.Items[0].Title != "b" {
		t.Fatalf("overdue = %+v", overdue)
	}
	if page := list(t, "?limit=1&offset=1"); page.Total != 3 || len(page.Items) != 1 || page.Items[0].Title != "b" {
		t.Fatalf("page = %+v", page)
	}

	// пустая выдача — [] а не null, чтобы фронту не проверять
	res := do(t, h, "GET", "/tasks?view=archive", "")
	res.expect(t, 200, "")
	if !strings.Contains(res.Body.String(), `"items":[]`) {
		t.Fatalf("body = %s", res.Body.String())
	}

	for _, tc := range []struct{ query, code string }{
		{"?view=someday", "INVALID_VIEW"},
		{"?view=project", "INVALID_QUERY"},
		{"?today=21.09.2026", "INVALID_DATE"},
		{"?limit=ten", "INVALID_QUERY"},
		{"?done=maybe", "INVALID_QUERY"},
		{"?sort=title", "INVALID_QUERY"},
		{"?from=2026-09-01", "INVALID_QUERY"},
	} {
		t.Run(tc.query, func(t *testing.T) {
			do(t, h, "GET", "/tasks"+tc.query, "").expect(t, 400, tc.code)
		})
	}
}

func TestPatchTask(t *testing.T) {
	h, _ := newTestServer(t)
	createTask(t, h, `{"title":"task","due_date":"2026-10-04","scheduled_for":"2026-09-21"}`)
	createTask(t, h, `{"title":"parent"}`)
	createTask(t, h, `{"title":"sub","parent_id":2}`)

	res := do(t, h, "PATCH", "/tasks/1", `{"due_date":null,"note":"заметка"}`)
	res.expect(t, 200, "")
	var got model.Task
	res.decode(t, &got)
	if got.DueDate != nil || got.ScheduledFor == nil || got.Note == nil || *got.Note != "заметка" {
		t.Fatalf("null должен очистить due_date, отсутствие ключа — не трогать scheduled_for: %+v", got)
	}
	// в JSON null, а не пропущенное поле
	if !strings.Contains(res.Body.String(), `"due_date":null`) {
		t.Fatalf("body = %s", res.Body.String())
	}

	do(t, h, "PATCH", "/tasks/1", `{"done":true}`).expect(t, 200, "")

	tests := []struct {
		name, path, body string
		status           int
		code             string
	}{
		{"already done", "/tasks/1", `{"done":true}`, 409, "ALREADY_DONE"},
		{"title null", "/tasks/1", `{"title":null}`, 400, "INVALID_BODY"},
		{"empty title", "/tasks/1", `{"title":" "}`, 400, "EMPTY_TITLE"},
		{"nothing", "/tasks/1", `{}`, 400, "NOTHING_TO_UPDATE"},
		{"bad date", "/tasks/1", `{"scheduled_for":"завтра"}`, 400, "INVALID_DATE"},
		{"too deep", "/tasks/1", `{"parent_id":3}`, 400, "SUBTASK_TOO_DEEP"},
		{"has subtasks", "/tasks/2", `{"parent_id":1}`, 400, "SUBTASK_TOO_DEEP"},
		{"no project", "/tasks/1", `{"project_id":7}`, 404, "PROJECT_NOT_FOUND"},
		{"not found", "/tasks/99", `{"title":"x"}`, 404, "TASK_NOT_FOUND"},
		{"bad id", "/tasks/x", `{"title":"x"}`, 400, "INVALID_ID"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			do(t, h, "PATCH", tt.path, tt.body).expect(t, tt.status, tt.code)
		})
	}

	do(t, h, "PATCH", "/tasks/1", `{"done":false}`).expect(t, 200, "")
	do(t, h, "PATCH", "/tasks/1", `{"done":false}`).expect(t, 409, "ALREADY_UNDONE")
}

func TestDeleteTask(t *testing.T) {
	h, repo := newTestServer(t)
	createTask(t, h, `{"title":"parent"}`)
	createTask(t, h, `{"title":"sub","parent_id":1}`)

	do(t, h, "DELETE", "/tasks/1", "").expect(t, 204, "")
	if len(repo.Tasks) != 0 {
		t.Fatalf("подзадачи не удалились каскадом: %+v", repo.Tasks)
	}
	do(t, h, "DELETE", "/tasks/1", "").expect(t, 404, "TASK_NOT_FOUND")
	do(t, h, "DELETE", "/tasks/abc", "").expect(t, 400, "INVALID_ID")
}

func TestReorder(t *testing.T) {
	h, repo := newTestServer(t)
	createTask(t, h, `{"title":"a"}`)
	createTask(t, h, `{"title":"b"}`)

	do(t, h, "POST", "/tasks/reorder", `{"scope":{"type":"inbox"},"ids":[2,1,77]}`).expect(t, 204, "")
	if repo.Tasks[1].Position != 0 || repo.Tasks[0].Position != 1 {
		t.Fatalf("positions: %d, %d", repo.Tasks[0].Position, repo.Tasks[1].Position)
	}
	do(t, h, "POST", "/tasks/reorder", `{"scope":{"type":"week"},"ids":[1]}`).expect(t, 400, "INVALID_BODY")
	do(t, h, "POST", "/tasks/reorder", `{"scope":{"type":"day","date":"x"},"ids":[1]}`).expect(t, 400, "INVALID_DATE")

	// эндпоинт снесён: он делал TRUNCATE всех задач, включая активные
	do(t, h, "POST", "/tasks/clear", "").expect(t, 405, "")
}

func TestProjects(t *testing.T) {
	h, _ := newTestServer(t)

	res := do(t, h, "POST", "/projects", `{"name":"Go","color":"#6AA6FF"}`)
	res.expect(t, 201, "")
	var p model.Project
	res.decode(t, &p)
	do(t, h, "POST", "/projects", `{"name":"Учёба"}`).expect(t, 201, "")
	createTask(t, h, `{"title":"x","project_id":1,"due_date":"2026-09-01"}`)

	res = do(t, h, "GET", "/projects?today=2026-09-21", "")
	res.expect(t, 200, "")
	var list []model.Project
	res.decode(t, &list)
	if len(list) != 2 || list[0].Counts == nil || *list[0].Counts != (model.ProjectCounts{Active: 1, Overdue: 1}) {
		t.Fatalf("list = %+v", list)
	}

	res = do(t, h, "PATCH", "/projects/1", `{"archived":true}`)
	res.expect(t, 200, "")
	res.decode(t, &p)
	if !p.Archived || p.Name != "Go" {
		t.Fatalf("patch = %+v", p)
	}
	res = do(t, h, "GET", "/projects", "")
	res.decode(t, &list)
	if len(list) != 1 {
		t.Fatalf("архивный список в выдаче по умолчанию: %+v", list)
	}
	res = do(t, h, "GET", "/projects?archived=true", "")
	res.decode(t, &list)
	if len(list) != 2 {
		t.Fatalf("archived=true: %d", len(list))
	}

	do(t, h, "POST", "/projects/reorder", `{"ids":[2,1]}`).expect(t, 204, "")

	for _, tc := range []struct {
		method, path, body string
		status             int
		code               string
	}{
		{"POST", "/projects", `{"name":""}`, 400, "EMPTY_NAME"},
		{"POST", "/projects", `{"name":"x","color":"red"}`, 400, "INVALID_COLOR"},
		{"PATCH", "/projects/1", `{"name":null}`, 400, "INVALID_BODY"},
		{"PATCH", "/projects/1", `{}`, 400, "NOTHING_TO_UPDATE"},
		{"PATCH", "/projects/99", `{"name":"x"}`, 404, "PROJECT_NOT_FOUND"},
		{"DELETE", "/projects/99", ``, 404, "PROJECT_NOT_FOUND"},
	} {
		t.Run(tc.method+tc.path+tc.body, func(t *testing.T) {
			do(t, h, tc.method, tc.path, tc.body).expect(t, tc.status, tc.code)
		})
	}

	do(t, h, "DELETE", "/projects/1", "").expect(t, 204, "")
	res = do(t, h, "GET", "/tasks/1", "")
	var task model.Task
	res.decode(t, &task)
	if task.ProjectID != nil {
		t.Fatalf("задача не ушла во «Входящие»: %v", *task.ProjectID)
	}
}

func TestDayEndpoints(t *testing.T) {
	h, _ := newTestServer(t)
	createTask(t, h, `{"title":"planned","scheduled_for":"2026-09-21"}`)
	createTask(t, h, `{"title":"overdue","due_date":"2026-09-20"}`)
	createTask(t, h, `{"title":"soon","due_date":"2026-09-25"}`)

	res := do(t, h, "GET", "/day?date=2026-09-21", "")
	res.expect(t, 200, "")
	var day service.Day
	res.decode(t, &day)
	if day.Date.String() != "2026-09-21" || len(day.Planned) != 1 || len(day.Overdue) != 1 ||
		day.Counts != (service.DayCounts{Planned: 1, Overdue: 1}) {
		t.Fatalf("day = %+v", day)
	}
	for _, key := range []string{`"carry_over":[]`, `"done_today":[]`} {
		if !strings.Contains(res.Body.String(), key) {
			t.Fatalf("нет %s в %s", key, res.Body.String())
		}
	}

	res = do(t, h, "GET", "/day/suggestions?date=2026-09-21", "")
	res.expect(t, 200, "")
	var sug service.Suggestions
	res.decode(t, &sug)
	if len(sug.Overdue) != 1 || len(sug.DueSoon) != 1 {
		t.Fatalf("suggestions = %+v", sug)
	}

	do(t, h, "POST", "/day/plan", `{"date":"2026-09-21","add":[2,3],"remove":[1]}`).expect(t, 204, "")
	res = do(t, h, "GET", "/day?date=2026-09-21", "")
	res.decode(t, &day)
	if len(day.Planned) != 2 || day.Planned[0].Title != "overdue" {
		t.Fatalf("после plan: %+v", day.Planned)
	}

	do(t, h, "GET", "/day?date=21.09", "").expect(t, 400, "INVALID_DATE")
	do(t, h, "POST", "/day/plan", `{"add":[1]}`).expect(t, 400, "INVALID_BODY")

	do(t, h, "PATCH", "/tasks/1", `{"done":true}`).expect(t, 200, "")
	res = do(t, h, "GET", "/stats/activity", "")
	res.expect(t, 200, "")
	var activity []model.DayCount
	res.decode(t, &activity)
	if len(activity) != 1 || activity[0].Done != 1 {
		t.Fatalf("activity = %+v", activity)
	}
	do(t, h, "GET", "/stats/activity?from=2026-09-22&to=2026-09-21", "").expect(t, 400, "INVALID_QUERY")
}

func TestRouting(t *testing.T) {
	h, _ := newTestServer(t)
	// чужой метод — 405 от самого ServeMux, неизвестный путь — 404
	if res := do(t, h, "PUT", "/tasks/1", `{}`); res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("PUT /tasks/1 = %d", res.Code)
	}
	if res := do(t, h, "GET", "/todos", ""); res.Code != http.StatusNotFound {
		t.Fatalf("GET /todos = %d", res.Code)
	}
}
