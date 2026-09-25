package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func noSleep(g *Guard) *[]time.Duration {
	var slept []time.Duration
	g.sleep = func(d time.Duration) { slept = append(slept, d) }
	return &slept
}

func TestDisabled(t *testing.T) {
	g := New("")
	if g.Enabled() || !g.Login("что угодно") || !g.Authed(httptest.NewRequest("GET", "/", nil)) {
		t.Fatal("пустой пароль должен выключать вход")
	}
}

func TestLogin(t *testing.T) {
	g := New("s3cret")
	slept := noSleep(g)

	if !g.Login("s3cret") || len(*slept) != 0 {
		t.Fatal("верный пароль не принят или была пауза")
	}
	if g.Login("s3cre") || g.Login("") || g.Login("S3CRET") {
		t.Fatal("неверный пароль принят")
	}
	if len(*slept) != 3 || (*slept)[0] != failDelay {
		t.Fatalf("паузы после неверного пароля: %v", *slept)
	}
}

func TestSession(t *testing.T) {
	g := New("s3cret")
	rec := httptest.NewRecorder()
	g.SetSession(rec, httptest.NewRequest("POST", "/auth/login", nil))
	c := rec.Result().Cookies()[0]

	if c.Name != CookieName || !c.HttpOnly || c.Secure || c.SameSite != http.SameSiteLaxMode || c.MaxAge <= 0 {
		t.Fatalf("cookie: %+v", c)
	}
	if c.Value == "s3cret" {
		t.Fatal("в cookie не должно быть самого пароля")
	}

	req := httptest.NewRequest("GET", "/tasks", nil)
	if g.Authed(req) {
		t.Fatal("без cookie — не вошёл")
	}
	req.AddCookie(c)
	if !g.Authed(req) {
		t.Fatal("с cookie — вошёл")
	}

	// смена пароля разлогинивает старые сессии
	req2 := httptest.NewRequest("GET", "/tasks", nil)
	req2.AddCookie(c)
	if New("другой").Authed(req2) {
		t.Fatal("cookie от старого пароля принята")
	}

	bad := httptest.NewRequest("GET", "/tasks", nil)
	bad.AddCookie(&http.Cookie{Name: CookieName, Value: "подделка"})
	if g.Authed(bad) {
		t.Fatal("поддельная cookie принята")
	}
}

func TestSecureBehindHTTPSProxy(t *testing.T) {
	g := New("x")
	req := httptest.NewRequest("POST", "/auth/login", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	rec := httptest.NewRecorder()
	g.SetSession(rec, req)
	if !rec.Result().Cookies()[0].Secure {
		t.Fatal("за HTTPS-прокси cookie должна быть Secure")
	}
}

func TestClearSession(t *testing.T) {
	rec := httptest.NewRecorder()
	New("x").ClearSession(rec, httptest.NewRequest("POST", "/auth/logout", nil))
	if c := rec.Result().Cookies()[0]; c.MaxAge >= 0 || c.Value != "" {
		t.Fatalf("cookie не стёрта: %+v", c)
	}
}
