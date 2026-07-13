import { Reorder, useDragControls } from 'framer-motion'
import type { Task } from '../api'
import { TodoRow } from './TodoRow'
import { GripIcon } from './icons'

export interface RowHandlers {
  editId: number | null
  editVal: string
  deletingId: number | null
  onToggle: (todo: Task) => void
  onDelete: (id: number) => void
  onStartEdit: (todo: Task) => void
  onEditChange: (v: string) => void
  onEditCommit: (id: number) => void
  onEditCancel: () => void
  onPriorityChange: (id: number, p: string) => void
  onToggleDaily: (todo: Task) => void
}

function row(todo: Task, h: RowHandlers, dragHandle?: React.ReactNode) {
  return (
    <TodoRow
      todo={todo}
      dragHandle={dragHandle}
      isDeleting={h.deletingId === todo.id}
      isEditing={h.editId === todo.id}
      editVal={h.editVal}
      onToggle={() => h.onToggle(todo)}
      onDelete={() => h.onDelete(todo.id)}
      onStartEdit={() => h.onStartEdit(todo)}
      onEditChange={h.onEditChange}
      onEditCommit={() => h.onEditCommit(todo.id)}
      onEditCancel={h.onEditCancel}
      onPriorityChange={(p) => h.onPriorityChange(todo.id, p)}
      onToggleDaily={() => h.onToggleDaily(todo)}
    />
  )
}

function DraggableRow({ todo, h }: { todo: Task; h: RowHandlers }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={todo} dragListener={false} dragControls={controls} as="div" className="reorder-item">
      {row(
        todo,
        h,
        <button
          className="drag-handle"
          aria-label="Перетащить для изменения порядка"
          onPointerDown={(e) => controls.start(e)}
        >
          <GripIcon />
        </button>,
      )}
    </Reorder.Item>
  )
}

/** Active (not done) tasks. Draggable when `draggable`, otherwise a static sorted list. */
export function ActiveList({
  tasks,
  draggable,
  onReorder,
  handlers,
}: {
  tasks: Task[]
  draggable: boolean
  onReorder: (tasks: Task[]) => void
  handlers: RowHandlers
}) {
  if (draggable) {
    return (
      <Reorder.Group axis="y" values={tasks} onReorder={onReorder} as="div" className="todo-list">
        {tasks.map((t) => (
          <DraggableRow key={t.id} todo={t} h={handlers} />
        ))}
      </Reorder.Group>
    )
  }
  return (
    <div className="todo-list">
      {tasks.map((t) => (
        <div key={t.id}>{row(t, handlers)}</div>
      ))}
    </div>
  )
}
