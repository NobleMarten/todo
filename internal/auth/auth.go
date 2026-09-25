// Package auth — вход по одному паролю из APP_PASSWORD для единственного владельца.
//
// Сессия без состояния: в cookie лежит HMAC-SHA256(пароль, sessionLabel). Сервер ничего не хранит,
// перезапуск сессии не сбрасывает, а смена пароля разлогинивает все устройства разом.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"sync"
	"time"
)

const (
	CookieName   = "todo_session"
	sessionLabel = "todo/session/v1"
	sessionTTL   = 365 * 24 * time.Hour
	// Пауза после неверного пароля. Держится под мьютексом, поэтому перебор идёт
	// не быстрее одной попытки за failDelay на весь процесс, сколько бы запросов ни шло параллельно.
	failDelay = time.Second
)

type Guard struct {
	password string
	token    string // пусто — вход выключен

	failMu sync.Mutex
	sleep  func(time.Duration) // подменяется в тестах
}

// New с пустым паролем возвращает выключенный Guard: пропускает всех.
func New(password string) *Guard {
	g := &Guard{password: password, sleep: time.Sleep}
	if password != "" {
		g.token = sign(password)
	}
	return g
}

func sign(password string) string {
	mac := hmac.New(sha256.New, []byte(password))
	mac.Write([]byte(sessionLabel))
	return hex.EncodeToString(mac.Sum(nil))
}

func (g *Guard) Enabled() bool { return g.token != "" }

// Login проверяет пароль за постоянное время; на неверном выдерживает паузу.
func (g *Guard) Login(password string) bool {
	if !g.Enabled() {
		return true
	}
	if subtle.ConstantTimeCompare([]byte(sign(password)), []byte(g.token)) == 1 {
		return true
	}
	g.failMu.Lock()
	defer g.failMu.Unlock()
	g.sleep(failDelay)
	return false
}

// Authed — есть ли у запроса действующая сессия (при выключенном входе — всегда да).
func (g *Guard) Authed(r *http.Request) bool {
	if !g.Enabled() {
		return true
	}
	c, err := r.Cookie(CookieName)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(c.Value), []byte(g.token)) == 1
}

// SetSession ставит cookie сессии. Secure — только если запрос пришёл по HTTPS
// (напрямую или через прокси с X-Forwarded-Proto), иначе браузер cookie не сохранит.
func (g *Guard) SetSession(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    g.token,
		Path:     "/",
		MaxAge:   int(sessionTTL / time.Second),
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func (g *Guard) ClearSession(w http.ResponseWriter, r *http.Request) {
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
