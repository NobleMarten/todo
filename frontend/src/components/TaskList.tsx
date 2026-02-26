import { AnimatePresence, motion } from "framer-motion"
import { Task } from "../types/task"
import { TaskItem } from "./TaskItem"

type Props = {
  tasks: Task[]
  onToggle: (id: number, done: boolean) => void
  onDelete: (id: number) => void
  busyIds?: Set<number>
}

export function TaskList({ tasks, onToggle, onDelete, busyIds }: Props) {
  return (
    <motion.ul layout className="list">
      <AnimatePresence initial={false}>
        {tasks.map(t => {
          const disabled = busyIds?.has(t.id) ?? false
          return (
            <motion.li
              key={t.id}
              layout
              className={`item ${disabled ? "itemDisabled" : ""}`}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <TaskItem task={t} onToggle={onToggle} onDelete={onDelete} disabled={disabled} />
            </motion.li>
          )
        })}
      </AnimatePresence>
    </motion.ul>
  )
}
