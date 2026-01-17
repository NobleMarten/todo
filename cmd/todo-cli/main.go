package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"todo/internal/service"
	"todo/internal/storage"
)

func printhelp() {
	fmt.Println("todo - mini task tracker")
	fmt.Println("")
	fmt.Println("commands:")
	fmt.Println("  add \"title\"   add a task")
	fmt.Println("  list          list tasks")
	fmt.Println("  done ID       mark task as done")
	fmt.Println("  undone ID       mark task as not done")
	fmt.Println("  del ID        delete task")
	fmt.Println("  help          show help")

}

func main() {
	store := storage.NewFileStorage("data/tasks.json") //создаем хранилище
	svc := service.NewTaskService(store)               //создаем сервис, которому даем хранилище
	// сервис будет делать Load/Save через хранилище (store)

	if len(os.Args) < 2 {
		printhelp()
		return
	}

	cmd := os.Args[1]
	switch cmd {

	case "help":
		printhelp()

	case "add":
		if len(os.Args) < 3 {
			fmt.Println("usage: add \"task title\"")
			return
		}

		title := strings.Join(os.Args[2:], " ") //склеиваем все после add в одну строку
		t, err := svc.Add(title)                //сервис добавляет задачу
		if err != nil {
			fmt.Println("error:", err)
			return
		}
		fmt.Printf("added #%d: %s \n", t.ID, t.Title)

	case "list":
		tasks, err := svc.List()
		if err != nil {
			fmt.Println("error:", err)
			return
		}
		if len(tasks) == 0 {
			fmt.Println("no tasks")
			return
		}
		for _, t := range tasks {
			status := " "
			if t.Done {
				status = "x"
			}
			fmt.Printf("[%s] #%d %s\n", status, t.ID, t.Title)
		}

	case "done":
		if len(os.Args) < 3 {
			fmt.Println("usage: done ID")
			return
		}
		id, err := strconv.Atoi(os.Args[2])
		if err != nil {
			fmt.Println("invalid ID:", os.Args[2])
			return
		}
		t, err := svc.Done(id)
		if err != nil {
			fmt.Println("error:", err)
			return
		}
		fmt.Printf("task #%d marked as done\n", t.ID)

	case "undone":
		if len(os.Args) < 3 {
			fmt.Println("usage: undone ID")
			return
		}
		id, err := strconv.Atoi(os.Args[2])
		if err != nil {
			fmt.Println("invalid ID:", os.Args[2])
			return
		}
		t, err := svc.Undone(id)
		if err != nil {
			fmt.Println("error:", err)
			return
		}
		fmt.Printf("task #%d marked as not done\n", t.ID)

	case "del":
		if len(os.Args) < 3 {
			fmt.Println("usage: del ID")
			return
		}
		id, err := strconv.Atoi(os.Args[2])
		if err != nil {
			fmt.Println("invalid ID:", os.Args[2])
			return
		}
		t, err := svc.Delete(id)
		if err != nil {
			fmt.Println("error:", err)
			return
		}
		fmt.Printf("task #%d deleted\n", t.ID)

	default:
		fmt.Println("unknown command:", cmd)
		printhelp()
	}
}
