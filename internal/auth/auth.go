// Package auth — вход по логину и паролю, у каждого пользователя свои задачи.
//
// Пароли — bcrypt. Сессия — случайный токен (32 байта) в HttpOnly-cookie; в базе лежит только его
// SHA-256 (как api_tokens в finance-tracker): утёкшая таблица sessions войти не даёт, а сессию можно
// отозвать — выход удаляет строку. Сессия живёт год и продлевается при использовании (не чаще раза в сутки).
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"todo/internal/model"

	"golang.org/x/crypto/bcrypt"
)

const (
	CookieName = "todo_session"
	SessionTTL = 365 * 24 * time.Hour
	// Продлеваем, когда с последнего продления прошло больше суток: не пишем в базу на каждый запрос.
	extendEvery = 24 * time.Hour
	// Пауза после неверного входа. Держится под мьютексом, поэтому перебор идёт не быстрее
	// одной попытки за failDelay на весь процесс, сколько бы запросов ни шло параллельно.
	failDelay = time.Second
	// MinPassword — меньше не принимает `todo-api user add/passwd`.
	MinPassword = 8
)

// Store — то, что auth берёт у хранилища (storage.UserRepo).
type Store interface {
	UserByLogin(ctx context.Context, login string) (model.User, error)
	CreateSession(ctx context.Context, userID int, tokenHash []byte, expires time.Time) error
	SessionUser(ctx context.Context, tokenHash []byte, now time.Time) (model.User, time.Time, error)
	ExtendSession(ctx context.Context, tokenHash []byte, expires time.Time) error
	DeleteSession(ctx context.Context, tokenHash []byte) error
}

type Service struct {
	store Store
	now   func() time.Time
	sleep func(time.Duration) // подменяется в тестах

	failMu sync.Mutex
	// хеш для сравнения, когда логина нет: иначе по времени ответа видно, какие логины существуют
	dummyHash []byte
}

func New(store Store) *Service {
	dummy, err := bcrypt.GenerateFromPassword([]byte("нет такого пользователя"), bcrypt.DefaultCost)
	if err != nil {
		panic(fmt.Sprintf("auth: bcrypt: %v", err)) // возможно только при неверной стоимости
	}
	return &Service{store: store, now: time.Now, sleep: time.Sleep, dummyHash: dummy}
}

var loginRe = regexp.MustCompile(`^[a-z0-9._-]{3,32}$`)

// NormalizeLogin — логин без пробелов по краям и в нижнем регистре; неподходящий — ErrInvalidLogin.
func NormalizeLogin(login string) (string, error) {
	login = strings.ToLower(strings.TrimSpace(login))
	if !loginRe.MatchString(login) {
		return "", model.ErrInvalidLogin
	}
	return login, nil
}

// HashPassword — bcrypt-хеш пароля не короче MinPassword символов.
func HashPassword(password string) (string, error) {
	if len([]rune(password)) < MinPassword {
		return "", model.ErrWeakPassword
	}
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(h), err
}

func hashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

// Login проверяет логин и пароль и открывает сессию: токен уходит в cookie, в базу — его хеш.
// Неизвестный логин и неверный пароль неотличимы ни по ответу, ни по времени.
func (s *Service) Login(ctx context.Context, login, password string) (string, model.User, error) {
	u, err := s.store.UserByLogin(ctx, strings.ToLower(strings.TrimSpace(login)))
	if err != nil && !errors.Is(err, model.ErrUserNotFound) {
		return "", model.User{}, err
	}
	// пароль сравниваем всегда: с хешем пользователя или с заглушкой, если логина нет или пароль не задан
	known := err == nil && u.PasswordHash != ""
	hash := s.dummyHash
	if known {
		hash = []byte(u.PasswordHash)
	}
	if bcrypt.CompareHashAndPassword(hash, []byte(password)) != nil || !known {
		s.failMu.Lock()
		defer s.failMu.Unlock()
		s.sleep(failDelay)
		return "", model.User{}, model.ErrWrongPassword
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", model.User{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	if err := s.store.CreateSession(ctx, u.ID, hashToken(token), s.now().Add(SessionTTL)); err != nil {
		return "", model.User{}, err
	}
	return token, u, nil
}

// Authenticate — владелец сессии. extended — срок продлён, cookie надо выдать заново (с новым сроком).
func (s *Service) Authenticate(ctx context.Context, token string) (u model.User, extended bool, err error) {
	if token == "" {
		return model.User{}, false, model.ErrUnauthorized
	}
	now := s.now()
	u, expires, err := s.store.SessionUser(ctx, hashToken(token), now)
	if err != nil {
		return model.User{}, false, err
	}
	if expires.Sub(now) < SessionTTL-extendEvery {
		if err := s.store.ExtendSession(ctx, hashToken(token), now.Add(SessionTTL)); err != nil {
			return model.User{}, false, err
		}
		extended = true
	}
	return u, extended, nil
}

// Logout удаляет сессию: украденная cookie после выхода бесполезна.
func (s *Service) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	return s.store.DeleteSession(ctx, hashToken(token))
}

// ── cookie ───────────────────────────────────────────────────────────────────

// TokenFrom — токен сессии из cookie запроса (пусто, если её нет).
func TokenFrom(r *http.Request) string {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

// SetCookie ставит cookie сессии. Secure — только если запрос пришёл по HTTPS
// (напрямую или через прокси с X-Forwarded-Proto), иначе браузер cookie не сохранит.
func SetCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(SessionTTL / time.Second),
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
}

// ── пользователь запроса ─────────────────────────────────────────────────────

type ctxKey struct{}

// WithUser кладёт пользователя сессии в контекст запроса (RequireAuth; в тестах — напрямую).
func WithUser(ctx context.Context, u model.User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

// UserFrom — пользователь запроса; false — запрос прошёл без сессии.
func UserFrom(ctx context.Context) (model.User, bool) {
	u, ok := ctx.Value(ctxKey{}).(model.User)
	return u, ok
}
