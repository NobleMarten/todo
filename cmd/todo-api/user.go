package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"todo/internal/auth"
	"todo/internal/storage"

	"golang.org/x/term"
)

const userUsage = `пользователи todo (регистрации в приложении нет — только так):

  todo-api user add <логин>      завести пользователя, пароль спросит
  todo-api user passwd <логин>   сменить пароль (все его сессии закрываются)
  todo-api user list             кто есть

Пароль читается из терминала без эха; без терминала — первой строкой stdin:
  echo 'пароль' | docker compose exec -T backend todo-api user add alice`

// runUser — подкоманда `todo-api user …`. Работает с той же базой (DB_URL), что и сервер.
func runUser(ctx context.Context, repo storage.UserRepo, args []string, stdin io.Reader, out io.Writer) error {
	if len(args) == 0 {
		return errors.New(userUsage)
	}
	switch cmd := args[0]; {
	case cmd == "list" && len(args) == 1:
		users, err := repo.ListUsers(ctx)
		if err != nil {
			return err
		}
		for _, u := range users {
			note := ""
			if u.PasswordHash == "" {
				note = "  (пароль не задан — войти нельзя)"
			}
			fmt.Fprintf(out, "%d\t%s%s\n", u.ID, u.Login, note)
		}
		return nil

	case (cmd == "add" || cmd == "passwd") && len(args) == 2:
		login, err := auth.NormalizeLogin(args[1])
		if err != nil {
			return err
		}
		password, err := readPassword(stdin, out)
		if err != nil {
			return err
		}
		hash, err := auth.HashPassword(password)
		if err != nil {
			return err
		}
		if cmd == "add" {
			if _, err := repo.CreateUser(ctx, login, hash); err != nil {
				return err
			}
			fmt.Fprintf(out, "пользователь %s заведён\n", login)
			return nil
		}
		u, err := repo.UserByLogin(ctx, login)
		if err != nil {
			return err
		}
		if err := repo.SetPassword(ctx, u.ID, hash); err != nil {
			return err
		}
		if err := repo.DeleteUserSessions(ctx, u.ID); err != nil {
			return err
		}
		fmt.Fprintf(out, "пароль %s изменён, все его сессии закрыты\n", login)
		return nil
	}
	return errors.New(userUsage)
}

// readPassword: в терминале — дважды без эха (опечатку в невидимом пароле иначе не заметить),
// иначе — первая строка stdin.
func readPassword(stdin io.Reader, out io.Writer) (string, error) {
	if f, ok := stdin.(*os.File); ok && term.IsTerminal(int(f.Fd())) {
		fmt.Fprint(out, "пароль: ")
		p1, err := term.ReadPassword(int(f.Fd()))
		fmt.Fprintln(out)
		if err != nil {
			return "", err
		}
		fmt.Fprint(out, "ещё раз: ")
		p2, err := term.ReadPassword(int(f.Fd()))
		fmt.Fprintln(out)
		if err != nil {
			return "", err
		}
		if string(p1) != string(p2) {
			return "", errors.New("пароли не совпали")
		}
		return string(p1), nil
	}
	line, err := bufio.NewReader(stdin).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}
