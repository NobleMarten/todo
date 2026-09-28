package auth

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
	"todo/internal/model"
	"todo/internal/storage"
)

type fixture struct {
	svc   *Service
	repo  *storage.FakeRepo
	now   time.Time
	slept []time.Duration
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{repo: &storage.FakeRepo{}, now: time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)}
	f.repo.Now = func() time.Time { return f.now }
	f.svc = New(f.repo)
	f.svc.now = func() time.Time { return f.now }
	f.svc.sleep = func(d time.Duration) { f.slept = append(f.slept, d) }
	for _, login := range []string{"alice", "bob"} {
		hash, err := HashPassword(login + "-password")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.repo.CreateUser(context.Background(), login, hash); err != nil {
			t.Fatal(err)
		}
	}
	// пользователь без пароля — как владелец сразу после миграции 00008
	if _, err := f.repo.CreateUser(context.Background(), "nopass", ""); err != nil {
		t.Fatal(err)
	}
	return f
}

func TestLogin(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()

	token, u, err := f.svc.Login(ctx, "  Alice ", "alice-password")
	if err != nil || u.Login != "alice" || len(token) < 40 || len(f.slept) != 0 {
		t.Fatalf("верный вход: token=%q user=%+v err=%v slept=%v", token, u, err, f.slept)
	}
	// в базе — хеш, а не сам токен
	if len(f.repo.Sessions) != 1 || bytes.Equal(f.repo.Sessions[0].TokenHash, []byte(token)) {
		t.Fatalf("сессия: %+v", f.repo.Sessions)
	}

	for _, c := range []struct{ login, password string }{
		{"alice", "bob-password"}, // чужой пароль
		{"alice", ""},
		{"nobody", "alice-password"}, // нет такого логина
		{"nopass", ""},               // пароль не задан
	} {
		if _, _, err := f.svc.Login(ctx, c.login, c.password); !errors.Is(err, model.ErrWrongPassword) {
			t.Fatalf("%s/%q: err = %v, want ErrWrongPassword", c.login, c.password, err)
		}
	}
	if len(f.slept) != 4 || f.slept[0] != failDelay {
		t.Fatalf("паузы после неверного входа: %v", f.slept)
	}
}

func TestAuthenticate(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	token, _, err := f.svc.Login(ctx, "bob", "bob-password")
	if err != nil {
		t.Fatal(err)
	}

	u, extended, err := f.svc.Authenticate(ctx, token)
	if err != nil || u.Login != "bob" || extended {
		t.Fatalf("свежая сессия: %+v %v %v", u, extended, err)
	}
	for _, bad := range []string{"", "x", token + "x"} {
		if _, _, err := f.svc.Authenticate(ctx, bad); !errors.Is(err, model.ErrUnauthorized) {
			t.Fatalf("токен %q: %v", bad, err)
		}
	}

	// через двое суток сессия продлевается на год вперёд от «сейчас»
	f.now = f.now.Add(48 * time.Hour)
	if _, extended, err := f.svc.Authenticate(ctx, token); err != nil || !extended {
		t.Fatalf("продление: %v %v", extended, err)
	}
	if got := f.repo.Sessions[0].Expires; !got.Equal(f.now.Add(SessionTTL)) {
		t.Fatalf("срок после продления: %v", got)
	}

	// не заходили дольше срока — сессия умерла
	f.now = f.now.Add(SessionTTL + time.Minute)
	if _, _, err := f.svc.Authenticate(ctx, token); !errors.Is(err, model.ErrUnauthorized) {
		t.Fatalf("истёкшая сессия: %v", err)
	}
}

func TestLogout(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	t1, _, _ := f.svc.Login(ctx, "alice", "alice-password")
	t2, _, _ := f.svc.Login(ctx, "alice", "alice-password") // второе устройство

	if err := f.svc.Logout(ctx, t1); err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.svc.Authenticate(ctx, t1); !errors.Is(err, model.ErrUnauthorized) {
		t.Fatalf("после выхода сессия жива: %v", err)
	}
	if _, _, err := f.svc.Authenticate(ctx, t2); err != nil {
		t.Fatalf("выход на одном устройстве закрыл другое: %v", err)
	}
	if err := f.svc.Logout(ctx, ""); err != nil {
		t.Fatal(err)
	}
}

func TestNormalizeLoginAndPassword(t *testing.T) {
	for in, want := range map[string]string{" NobleMarten ": "noblemarten", "a.b_c-1": "a.b_c-1"} {
		if got, err := NormalizeLogin(in); err != nil || got != want {
			t.Fatalf("%q → %q, %v", in, got, err)
		}
	}
	for _, bad := range []string{"ab", "имя", "with space", "a/b", string(make([]byte, 33))} {
		if _, err := NormalizeLogin(bad); !errors.Is(err, model.ErrInvalidLogin) {
			t.Fatalf("%q принят", bad)
		}
	}
	if _, err := HashPassword("1234567"); !errors.Is(err, model.ErrWeakPassword) {
		t.Fatal("короткий пароль принят")
	}
	if _, err := HashPassword("пароль12"); err != nil {
		t.Fatalf("8 букв кириллицей: %v", err)
	}
}

func TestCookie(t *testing.T) {
	rec := httptest.NewRecorder()
	SetCookie(rec, httptest.NewRequest("GET", "/", nil), "tok")
	c := rec.Result().Cookies()[0]
	if c.Value != "tok" || !c.HttpOnly || c.Secure || c.MaxAge != int(SessionTTL/time.Second) {
		t.Fatalf("cookie по http: %+v", c)
	}
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	rec = httptest.NewRecorder()
	SetCookie(rec, req, "tok")
	if !rec.Result().Cookies()[0].Secure {
		t.Fatal("за HTTPS-прокси cookie должна быть Secure")
	}
	req.AddCookie(&http.Cookie{Name: CookieName, Value: "abc"})
	if TokenFrom(req) != "abc" || TokenFrom(httptest.NewRequest("GET", "/", nil)) != "" {
		t.Fatal("токен из cookie прочитан неверно")
	}
}
