package transport

import (
	"net/http"
	"testing"
	"todo/internal/auth"
)

func newAuthServer(t *testing.T, password string) http.Handler {
	t.Helper()
	h, _ := newTestServer(t)
	mux := h.(*http.ServeMux)
	g := auth.New(password)
	RegisterAuth(mux, g)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	return RequireAuth(g, mux)
}

func TestAuthFlow(t *testing.T) {
	h := newAuthServer(t, "pw")

	do(t, h, "GET", "/tasks", "").expect(t, 401, "UNAUTHORIZED")
	do(t, h, "POST", "/tasks", `{"title":"x"}`).expect(t, 401, "UNAUTHORIZED")
	do(t, h, "GET", "/healthz", "").expect(t, 200, "")
	do(t, h, "OPTIONS", "/tasks", "").expect(t, 405, "") // preflight доходит до mux (CORS отвечает раньше, в main)

	var st map[string]bool
	do(t, h, "GET", "/auth/status", "").decode(t, &st)
	if !st["enabled"] || st["authed"] {
		t.Fatalf("status до входа: %v", st)
	}

	do(t, h, "POST", "/auth/login", `{"password":"nope"}`).expect(t, 401, "WRONG_PASSWORD")
	do(t, h, "POST", "/auth/login", `not json`).expect(t, 400, "INVALID_BODY")

	res := do(t, h, "POST", "/auth/login", `{"password":"pw"}`)
	res.expect(t, 204, "")
	cookies := res.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies: %v", cookies)
	}

	withCookie := func(method, path string) response {
		req := newReq(method, path, "")
		req.AddCookie(cookies[0])
		return serve(h, req)
	}
	withCookie("GET", "/tasks").expect(t, 200, "")
	withCookie("GET", "/auth/status").decode(t, &st)
	if !st["authed"] {
		t.Fatalf("status после входа: %v", st)
	}

	out := withCookie("POST", "/auth/logout")
	out.expect(t, 204, "")
	if c := out.Result().Cookies(); len(c) != 1 || c[0].MaxAge >= 0 {
		t.Fatalf("logout не стёр cookie: %v", c)
	}
}

func TestAuthDisabled(t *testing.T) {
	h := newAuthServer(t, "")
	do(t, h, "GET", "/tasks", "").expect(t, 200, "")
	do(t, h, "POST", "/auth/login", `{"password":""}`).expect(t, 204, "")

	var st map[string]bool
	do(t, h, "GET", "/auth/status", "").decode(t, &st)
	if st["enabled"] || !st["authed"] {
		t.Fatalf("status: %v", st)
	}
}
