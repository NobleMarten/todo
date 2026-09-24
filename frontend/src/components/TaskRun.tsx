import { useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import type { DateStr, Project, Task } from '../api/types'
import { TaskRow } from './TaskRow'

export interface RunProps {
  run: Task[]
  today: DateStr
  draggable: boolean
  projectById?: Map<number, Project>
  onToggle: (t: Task) => void
  onSetDue: (t: Task, d: DateStr | null) => void
  onReorder: (ids: number[]) => void
  onDelete?: (t: Task) => void
  onToday?: (t: Task) => void
}

/**
 * Отрезок строк задач, который можно перетаскивать целиком (framer-motion Reorder).
 * Порядок меняется локально, а onReorder получает новый порядок отрезка только при отпускании.
 */
export function TaskRun({
  run,
  today,
  draggable,
  projectById,
  onToggle,
  onSetDue,
  onReorder,
  onDelete,
  onToday,
}: RunProps) {
  const [order, setOrder] = useState<number[] | null>(null) // порядок во время перетаскивания
  const orderRef = useRef<number[] | null>(null)
  const byId = new Map(run.map((t) => [t.id, t]))
  const ids = (order ?? run.map((t) => t.id)).filter((id) => byId.has(id))

  const rowOf = (t: Task) => ({
    task: t,
    today,
    project: t.project_id !== null ? projectById?.get(t.project_id) : undefined,
    onToggle: () => onToggle(t),
    onSetDue: (d: DateStr | null) => onSetDue(t, d),
    onDelete: onDelete && (() => onDelete(t)),
    onToday: onToday && (() => onToday(t)),
  })

  if (!draggable || run.length < 2) {
    return (
      <ul className="task-list">
        {run.map((t) => (
          <li key={t.id}>
            <TaskRow {...rowOf(t)} gripSpace={draggable} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Reorder.Group
      as="ul"
      axis="y"
      values={ids}
      onReorder={(next: number[]) => {
        orderRef.current = next
        setOrder(next)
      }}
      className="task-list"
    >
      {ids.map((id) => (
        <DraggableTask
          key={id}
          id={id}
          row={rowOf(byId.get(id)!)}
          onDrop={() => {
            if (orderRef.current) onReorder(orderRef.current)
            orderRef.current = null
            setOrder(null)
          }}
        />
      ))}
    </Reorder.Group>
  )
}

function DraggableTask({
  id,
  row,
  onDrop,
}: {
  id: number
  row: Omit<Parameters<typeof TaskRow>[0], 'dragControls'>
  onDrop: () => void
}) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={controls} onDragEnd={onDrop} className="reorder-item">
      <TaskRow {...row} dragControls={controls} />
    </Reorder.Item>
  )
}
