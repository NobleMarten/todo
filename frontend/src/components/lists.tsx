import { useEffect, useMemo, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import type { Task } from '../api'
import type { Section } from '../lib/format'
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

/** Static list — used for the completed group (no drag, no sections). */
export function ActiveList({ tasks, handlers }: { tasks: Task[]; handlers: RowHandlers }) {
  return (
    <div className="todo-list">
      {tasks.map((t) => (
        <div key={t.id}>{row(t, handlers)}</div>
      ))}
    </div>
  )
}

// A section boundary. It's a Reorder.Item (so it gets displaced as tasks cross it) but
// it can't be picked up itself (dragListener=false, no controls).
function SectionHeader({ valueKey, section, label }: { valueKey: string; section: Section; label: string }) {
  return (
    <Reorder.Item value={valueKey} dragListener={false} as="div" className={`section-divider sec-${section}`}>
      <span className="section-divider-label">{label}</span>
    </Reorder.Item>
  )
}

function DraggableRow({
  valueKey,
  todo,
  h,
  onDragStart,
  onDragEnd,
}: {
  valueKey: string
  todo: Task
  h: RowHandlers
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={valueKey}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      as="div"
      className="reorder-item"
    >
      {row(
        todo,
        h,
        <button
          className="drag-handle"
          aria-label="Перетащить: вверх/вниз — порядок, через границу — приоритет"
          onPointerDown={(e) => controls.start(e)}
        >
          <GripIcon />
        </button>,
      )}
    </Reorder.Item>
  )
}

export interface BoardSection {
  key: Section
  label: string
  tasks: Task[]
}

/**
 * One Reorder.Group holding every section header + task as encoded string keys
 * ("h:<section>" / "t:<id>"). Dragging is live-local via `values`; only on drag end
 * do we hand the final key order back through `onCommit`, which derives each task's
 * new section from where it landed relative to the headers.
 */
export function SectionsBoard({
  sections,
  onCommit,
  handlers,
}: {
  sections: BoardSection[]
  onCommit: (keys: string[]) => void
  handlers: RowHandlers
}) {
  const derived = useMemo(() => {
    const v: string[] = []
    for (const s of sections) {
      v.push(`h:${s.key}`)
      for (const t of s.tasks) v.push(`t:${t.id}`)
    }
    return v
  }, [sections])

  const [values, setValues] = useState<string[]>(derived)
  const draggingRef = useRef(false)
  const valuesRef = useRef(values)
  valuesRef.current = values

  // re-seed from data whenever it changes, but never mid-drag
  useEffect(() => {
    if (!draggingRef.current) setValues(derived)
  }, [derived])

  const taskById = useMemo(() => {
    const m = new Map<number, Task>()
    for (const s of sections) for (const t of s.tasks) m.set(t.id, t)
    return m
  }, [sections])

  const labels = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sections) m.set(s.key, s.label)
    return m
  }, [sections])

  const endDrag = () => {
    draggingRef.current = false
    onCommit(valuesRef.current)
  }

  return (
    <Reorder.Group axis="y" values={values} onReorder={setValues} as="div" className="todo-list">
      {values.map((key) => {
        if (key[0] === 'h') {
          const section = key.slice(2) as Section
          return <SectionHeader key={key} valueKey={key} section={section} label={labels.get(section) ?? ''} />
        }
        const task = taskById.get(Number(key.slice(2)))
        if (!task) return null
        return (
          <DraggableRow
            key={key}
            valueKey={key}
            todo={task}
            h={handlers}
            onDragStart={() => {
              draggingRef.current = true
            }}
            onDragEnd={endDrag}
          />
        )
      })}
    </Reorder.Group>
  )
}
