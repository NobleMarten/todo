import { motion } from "framer-motion"
import { Task } from "../types/task"

type Props = {
  task: Task
  onToggle: (id: number, done: boolean) => void
  onDelete: (id: number) => void
  disabled?: boolean
}

export function TaskItem({ task, onToggle, onDelete, disabled }: Props) {
  return (
    <>
      <input
        className="checkbox"
        type="checkbox"
        checked={task.done}
        disabled={disabled}
        onChange={() => onToggle(task.id, !task.done)}
      />

      <div className={`text ${task.done ? "textDone" : ""}`}>{task.title}</div>

      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
        className="iconBtn"
        onClick={() => onDelete(task.id)}
        disabled={disabled}
        title="Удалить"
      >
        ✕
      </motion.button>
    </>
  )
}
