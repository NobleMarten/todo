package transport

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"todo/internal/auth"
	"todo/internal/model"
	"todo/internal/storage"
)

// newAuthServer — как в main: роутер, /auth/*, /healthz и RequireAuth поверх одного FakeRepo
// с двумя пользователями. Запросы — без пользователя в контексте (newAnonReq), как из сети.
func newAuthServer(t *testing.T) (http.Handler, *storage.FakeRepo) {
	t.Helper()
	h, repo := newTestServer(t)
	mux := h.(*http.ServeMux)
	svc := auth.New(repo)
	RegisterAuth(mux, svc)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	for _, login := range []string{"alice", "bob"} {
		hash, err := auth.HashPassword(login + "-password")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := repo.CreateUser(context.Background(), login, hash); err != nil {
			t.Fatal(err)
		}
	}
	return RequireAuth(svc, mux), repo
}

// client — запросы с cookie сессии одного пользователя.
type client struct {
	t      *testing.T
	h      http.Handler
	cookie *http.Cookie
}

func (c client) do(method, path, body string) response {
	c.t.Helper()
	req := newAnonReq(method, path, body)
	if c.cookie != nil {
		req.AddCookie(c.cookie)
	}
	return serve(c.h, req)
}

func login(t *testing.T, h http.Handler, name string) client {
	t.Helper()
	res := serve(h, newAnonReq("POST", "/auth/login", `{"login":"`+name+`","password":"`+name+`-password"}`))
	res.expect(t, 200, "")
	var u struct{ Login string }
	res.decode(t, &u)
	cookies := res.Result().Cookies()
	if u.Login != name || len(cookies) != 1 || !cookies[0].HttpOnly {
		t.Fatalf("вход %s: %+v, cookies %v", name, u, cookies)
	}
	return client{t: t, h: h, cookie: cookies[0]}
}

func TestAuthFlow(t *testing.T) {
	h, _ := newAuthServer(t)
	anon := client{t: t, h: h}

	anon.do("GET", "/tasks", "").expect(t, 401, "UNAUTHORIZED")
	anon.do("POST", "/tasks", `{"title":"x"}`).expect(t, 401, "UNAUTHORIZED")
	anon.do("GET", "/healthz", "").expect(t, 200, "")
	anon.do("OPTIONS", "/tasks", "").expect(t, 405, "") // preflight доходит до mux (CORS отвечает раньше, в main)

	var st struct {
		Authed bool
		User   *struct{ Login string }
	}
	anon.do("GET", "/auth/status", "").decode(t, &st)
	if st.Authed || st.User != nil {
		t.Fatalf("status до входа: %+v", st)
	}

	anon.do("POST", "/auth/login", `{"login":"alice","password":"bob-password"}`).expect(t, 401, "WRONG_PASSWORD")
	anon.do("POST", "/auth/login", `{"login":"nobody","password":"x"}`).expect(t, 401, "WRONG_PASSWORD")
	anon.do("POST", "/auth/login", `not json`).expect(t, 400, "INVALID_BODY")
	(client{t: t, h: h, cookie: &http.Cookie{Name: auth.CookieName, Value: "подделка"}}).
		do("GET", "/tasks", "").expect(t, 401, "UNAUTHORIZED")

	alice := login(t, h, "alice")
	alice.do("GET", "/tasks", "").expect(t, 200, "")
	alice.do("GET", "/auth/status", "").decode(t, &st)
	if !st.Authed || st.User == nil || st.User.Login != "alice" {
		t.Fatalf("status после входа: %+v", st)
	}

	out := alice.do("POST", "/auth/logout", "")
	out.expect(t, 204, "")
	if c := out.Result().Cookies(); len(c) != 1 || c[0].MaxAge >= 0 {
		t.Fatalf("logout не стёр cookie: %v", c)
	}
	// сессия удалена в базе: та же cookie больше не пускает
	alice.do("GET", "/tasks", "").expect(t, 401, "UNAUTHORIZED")
}

// Два пользователя через HTTP: каждый видит и меняет только своё, чужое — «не найдено».
func TestUsersIsolated(t *testing.T) {
	h, _ := newAuthServer(t)
	alice, bob := login(t, h, "alice"), login(t, h, "bob")

	var p model.Project
	res := alice.do("POST", "/projects", `{"name":"дом","color":"#4ADE80"}`)
	res.expect(t, 201, "")
	res.decode(t, &p)
	var task model.Task
	res = alice.do("POST", "/tasks", `{"title":"секрет","project_id":`+strconv.Itoa(p.ID)+`,"scheduled_for":"2026-09-28"}`)
	res.expect(t, 201, "")
	res.decode(t, &task)
	if raw := res.Body.String(); strings.Contains(raw, "user_id") {
		t.Fatalf("user_id утёк в ответ: %s", raw)
	}

	id := strconv.Itoa(task.ID)
	var list ListTasksResponse
	bob.do("GET", "/tasks?view=all", "").decode(t, &list)
	if list.Total != 0 {
		t.Fatalf("bob видит задачи alice: %+v", list)
	}
	var projects []model.Project
	bob.do("GET", "/projects", "").decode(t, &projects)
	if len(projects) != 0 {
		t.Fatalf("bob видит списки alice: %+v", projects)
	}
	bob.do("GET", "/tasks/"+id, "").expect(t, 404, "TASK_NOT_FOUND")
	bob.do("PATCH", "/tasks/"+id, `{"title":"взлом"}`).expect(t, 404, "TASK_NOT_FOUND")
	bob.do("DELETE", "/tasks/"+id, "").expect(t, 404, "TASK_NOT_FOUND")
	bob.do("POST", "/tasks", `{"title":"в чужой список","project_id":`+strconv.Itoa(p.ID)+`}`).expect(t, 404, "PROJECT_NOT_FOUND")
	bob.do("POST", "/tasks", `{"title":"чужая подзадача","parent_id":`+id+`}`).expect(t, 404, "TASK_NOT_FOUND")
	bob.do("PATCH", "/projects/"+strconv.Itoa(p.ID), `{"name":"взлом"}`).expect(t, 404, "PROJECT_NOT_FOUND")
	bob.do("DELETE", "/projects/"+strconv.Itoa(p.ID), "").expect(t, 404, "PROJECT_NOT_FOUND")
	bob.do("POST", "/day/plan", `{"date":"2026-09-29","add":[`+id+`]}`).expect(t, 204, "")
	bob.do("POST", "/tasks/reorder", `{"scope":{"type":"inbox"},"ids":[`+id+`]}`).expect(t, 204, "")

	var day struct{ Planned []model.Task }
	bob.do("GET", "/day?date=2026-09-28", "").decode(t, &day)
	if len(day.Planned) != 0 {
		t.Fatalf("bob видит день alice: %+v", day)
	}
	var counts map[string]int
	bob.do("GET", "/tasks/counts?today=2026-09-28", "").decode(t, &counts)
	if counts["all"] != 0 {
		t.Fatalf("счётчики bob: %v", counts)
	}

	// у alice всё на месте и не тронуто
	var got model.Task
	alice.do("GET", "/tasks/"+id, "").decode(t, &got)
	if got.Title != "секрет" || got.ScheduledFor == nil || got.ScheduledFor.String() != "2026-09-28" {
		t.Fatalf("задача alice изменилась: %+v", got)
	}
}

func TestWithUserRequiresUser(t *testing.T) {
	h, _ := newTestServer(t)
	serve(h, newAnonReq("GET", "/tasks", "")).expect(t, 401, "UNAUTHORIZED")
}
