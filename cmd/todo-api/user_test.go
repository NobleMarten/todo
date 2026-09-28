package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"
	"todo/internal/auth"
	"todo/internal/model"
	"todo/internal/storage"
)

func TestRunUser(t *testing.T) {
	ctx := context.Background()
	repo := &storage.FakeRepo{}
	run := func(stdin string, args ...string) (string, error) {
		var out bytes.Buffer
		err := runUser(ctx, repo, args, strings.NewReader(stdin), &out)
		return out.String(), err
	}

	if _, err := run("пароль-алисы\n", "add", "Alice"); err != nil {
		t.Fatal(err)
	}
	if _, err := run("другой-пароль\n", "add", "alice"); !errors.Is(err, model.ErrLoginTaken) {
		t.Fatalf("повторный логин: %v", err)
	}
	if _, err := run("1234567\n", "add", "bob"); !errors.Is(err, model.ErrWeakPassword) {
		t.Fatalf("короткий пароль: %v", err)
	}
	if _, err := run("длинный-пароль\n", "add", "b"); !errors.Is(err, model.ErrInvalidLogin) {
		t.Fatalf("короткий логин: %v", err)
	}

	svc := auth.New(repo)
	if _, _, err := svc.Login(ctx, "alice", "пароль-алисы"); err != nil {
		t.Fatalf("вход с паролем из add: %v", err)
	}
	if err := repo.CreateSession(ctx, 1, []byte("old"), time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}

	// passwd меняет пароль и закрывает все сессии пользователя
	if _, err := run("новый-пароль\n", "passwd", "alice"); err != nil {
		t.Fatal(err)
	}
	if len(repo.Sessions) != 0 {
		t.Fatalf("сессии после смены пароля: %d", len(repo.Sessions))
	}
	if _, _, err := svc.Login(ctx, "alice", "новый-пароль"); err != nil {
		t.Fatalf("вход с новым паролем: %v", err)
	}
	if _, err := run("пароль-пароль\n", "passwd", "nobody"); !errors.Is(err, model.ErrUserNotFound) {
		t.Fatalf("passwd неизвестного: %v", err)
	}

	// пользователь без пароля (владелец после миграции) виден в list с пометкой
	if _, err := repo.CreateUser(ctx, "noblemarten", ""); err != nil {
		t.Fatal(err)
	}
	out, err := run("", "list")
	if err != nil || !strings.Contains(out, "alice") || !strings.Contains(out, "noblemarten  (пароль не задан") {
		t.Fatalf("list: %q %v", out, err)
	}

	if _, err := run("", "nonsense"); err == nil || !strings.Contains(err.Error(), "todo-api user add") {
		t.Fatalf("неизвестная подкоманда: %v", err)
	}
}
