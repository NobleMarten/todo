import type { Project, Task } from '../api/types'
import { useOpenTask } from './TaskSheet'
import { CheckIcon } from './icons'

interface Props {
  task: Task
  project?: Project
  aside?: string // справа моноширинным: время выполнения, дата
  onUndo: () => void
}

/** Выполненная задача (макет A1, «готово»): приглушённая галочка — вернуть, заголовок — карточка. */
export function DoneRow({ task, project, aside, onUndo }: Props) {
  const openTask = useOpenTask()
  return (
    <div className="done-row">
      <button className="check-hit" onClick={onUndo} aria-label={`вернуть: ${task.title}`} aria-pressed="true">
        <span className="done-check">
          <CheckIcon />
        </span>
      </button>
      <button className="done-main" onClick={() => openTask(task.id)}>
        <span className="done-title">{task.title}</span>
        {project && (
          <span className="task-meta">
            <span className="dot" style={{ background: project.color }} />
            {project.name}
          </span>
        )}
      </button>
      {aside && <span className="done-aside mono-num">{aside}</span>}
    </div>
  )
}
