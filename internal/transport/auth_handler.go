package transport

import (
	"net/http"
	"strings"
	"todo/internal/auth"
	"todo/internal/model"
)

// RegisterAuth вешает /auth/* на mux. Эти пути открыты: без них не войти.
func RegisterAuth(mux *http.ServeMux, g *auth.Guard) {
	// GET /auth/status → {enabled, authed}: фронт решает, показывать ли экран входа.
	mux.HandleFunc("GET /auth/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"enabled": g.Enabled(), "authed": g.Authed(r)})
	})

	// POST /auth/login {password} → 204 + cookie сессии; неверный пароль — 401 WRONG_PASSWORD.
	mux.HandleFunc("POST /auth/login", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Password string `json:"password"`
		}
		if err := decodeJSON(w, r, &req); err != nil {
			WriteError(w, err)
			return
		}
		if !g.Login(req.Password) {
			WriteError(w, model.ErrWrongPassword)
			return
		}
		if g.Enabled() {
			g.SetSession(w, r)
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// POST /auth/logout → 204, cookie стирается.
	mux.HandleFunc("POST /auth/logout", func(w http.ResponseWriter, r *http.Request) {
		g.ClearSession(w, r)
		w.WriteHeader(http.StatusNoContent)
	})
}

// RequireAuth пропускает без сессии только /auth/*, /healthz и preflight OPTIONS;
// остальное — 401 UNAUTHORIZED. При выключенном входе ничего не проверяет.
func RequireAuth(g *auth.Guard, next http.Handler) http.Handler {
	if !g.Enabled() {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		open := r.Method == http.MethodOptions ||
			r.URL.Path == "/healthz" ||
			strings.HasPrefix(r.URL.Path, "/auth/")
		if !open && !g.Authed(r) {
			WriteError(w, model.ErrUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
