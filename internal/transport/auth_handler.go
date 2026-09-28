package transport

import (
	"context"
	"net/http"
	"strings"
	"todo/internal/auth"
	"todo/internal/model"
)

// Auth — то, что транспорту нужно от auth.Service.
type Auth interface {
	Login(ctx context.Context, login, password string) (string, model.User, error)
	Authenticate(ctx context.Context, token string) (model.User, bool, error)
	Logout(ctx context.Context, token string) error
}

type userResponse struct {
	Login string `json:"login"`
}

// RegisterAuth вешает /auth/* на mux. Эти пути открыты: без них не войти.
func RegisterAuth(mux *http.ServeMux, a Auth) {
	// GET /auth/status → {authed, user?: {login}}: фронт решает, показывать ли экран входа.
	mux.HandleFunc("GET /auth/status", func(w http.ResponseWriter, r *http.Request) {
		u, extended, err := a.Authenticate(r.Context(), auth.TokenFrom(r))
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"authed": false})
			return
		}
		if extended {
			auth.SetCookie(w, r, auth.TokenFrom(r))
		}
		writeJSON(w, http.StatusOK, map[string]any{"authed": true, "user": userResponse{Login: u.Login}})
	})

	// POST /auth/login {login, password} → 200 {login} + cookie сессии;
	// неверный логин или пароль — 401 WRONG_PASSWORD (с паузой 1 с), без подсказки, что именно неверно.
	mux.HandleFunc("POST /auth/login", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Login    string `json:"login"`
			Password string `json:"password"`
		}
		if err := decodeJSON(w, r, &req); err != nil {
			WriteError(w, err)
			return
		}
		token, u, err := a.Login(r.Context(), req.Login, req.Password)
		if err != nil {
			WriteError(w, err)
			return
		}
		auth.SetCookie(w, r, token)
		writeJSON(w, http.StatusOK, userResponse{Login: u.Login})
	})

	// POST /auth/logout → 204: сессия удалена в базе, cookie стёрта.
	mux.HandleFunc("POST /auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if err := a.Logout(r.Context(), auth.TokenFrom(r)); err != nil {
			WriteError(w, err)
			return
		}
		auth.ClearCookie(w, r)
		w.WriteHeader(http.StatusNoContent)
	})
}

// RequireAuth пропускает без сессии только /auth/*, /healthz и preflight OPTIONS;
// остальное — 401 UNAUTHORIZED. Пользователь сессии кладётся в контекст запроса.
func RequireAuth(a Auth, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || r.URL.Path == "/healthz" || strings.HasPrefix(r.URL.Path, "/auth/") {
			next.ServeHTTP(w, r)
			return
		}
		u, extended, err := a.Authenticate(r.Context(), auth.TokenFrom(r))
		if err != nil {
			WriteError(w, err)
			return
		}
		if extended {
			auth.SetCookie(w, r, auth.TokenFrom(r))
		}
		next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), u)))
	})
}

// userHandler — обработчик API: всегда знает, чьи задачи.
type userHandler func(w http.ResponseWriter, r *http.Request, userID int)

// withUser достаёт пользователя из контекста (его кладёт RequireAuth). Без него — 401, а не «чьи-то» данные:
// вторая линия защиты на случай, если маршрут когда-нибудь окажется за пределами RequireAuth.
func withUser(h userHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, ok := auth.UserFrom(r.Context())
		if !ok {
			WriteError(w, model.ErrUnauthorized)
			return
		}
		h(w, r, u.ID)
	}
}
