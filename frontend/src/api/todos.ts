import { Task } from "../types/task"

const API_URL = "http://localhost:8080"

export async function getTodos(): Promise<Task[]> {
  const res = await fetch(`${API_URL}/todos`)
  return res.json()
}

export async function addTodo(title: string): Promise<Task> {
  const res = await fetch(`${API_URL}/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
  return res.json()
}

export async function toggleTodo(id: number, done: boolean) {
  await fetch(`${API_URL}/todos/done?id=${id}&done=${done}`, {
    method: "PUT",
  })
}

export async function deleteTodo(id: number) {
  await fetch(`${API_URL}/todos/${id}`, {
    method: "DELETE",
  })
}
