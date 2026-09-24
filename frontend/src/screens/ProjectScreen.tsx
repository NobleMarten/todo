import { useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Reorder, useDragControls } from 'framer-motion'
import type { DateStr, Project, Task } from '../api/types'
import { ColorSwatches } from '../components/ProjectPicker'
import { QuickAdd } from '../components/QuickAdd'
import { ScreenHeader } from '../components/ScreenHeader'
import { Sheet } from '../components/Sheet'
import { TaskRow } from '../components/TaskRow'
import { MoreIcon, SpinIcon, TrashIcon } from '../components/icons'
import { useProjects } from '../hooks/useProjects'
import { reorderScopeOf, useTasks, useWeekProgress, type ListSpec } from '../hooks/useTasks'
import { todayStr } from '../lib/date'
import { groupTasks, PROJECT_NAME_MAX, sectionsFor, type Grouping } from '../lib/format'

const SMART: Record<string, { spec: ListSpec; title: string; empty: string }> = {
  inbox: { spec: { view: 'inbox' }, title: 'входящие', empty: 'во входящих пусто' },
  all: { spec: { view: 'all' }, title: 'все задачи', empty: 'активных задач нет' },
  today: { spec: { view: 'today' }, title: 'сегодня', empty: 'на сегодня ничего не запланировано' },
  week: { spec: { view: 'week' }, title: '7 дней', empty: 'на неделю ни дедлайнов, ни планов' },
  overdue: { spec: { view: 'overdue' }, title: 'просрочено', empty: 'просроченных нет' },
}

/** /lists/:id — число (список) либо inbox / all / today / week / overdue. */
export function ProjectScreen() {
  const { id = '' } = useParams()
  const smart = SMART[id]
  const projectId = /^\d+$/.test(id) ? Number(id) : null
  if (!smart && projectId === null) return <Navigate to="/lists" replace />

  const spec: ListSpec = smart ? smart.spec : { view: 'project', projectId: projectId! }
  // key: при переходе между списками состояние экрана (группировка, меню) начинается заново
  return <ListView key={id} spec={spec} smartTitle={smart?.title} emptyText={smart?.empty} />
}

interface ViewProps {
  spec: ListSpec
  smartTitle?: string
  emptyText?: string
}

function ListView({ spec, smartTitle, emptyText }: ViewProps) {
  const navigate = useNavigate()
  const today = todayStr()
  const { tasks, loading, error, actionError, clearActionError, reload, add, update, reorder } = useTasks(spec)
  const projects = useProjects()
  const [grouping, setGrouping] = useState<Grouping>('date')
  const [menuOpen, setMenuOpen] = useState(false)

  const projectId = spec.view === 'project' ? spec.projectId : null
  const project = projectId !== null ? projects.all.find((p) => p.id === projectId) : undefined
  const progress = useWeekProgress(projectId, tasks.length)
  const draggable = reorderScopeOf(spec) !== null
  const projectById = new Map(projects.all.map((p) => [p.id, p]))
  const groups = groupTasks(tasks, grouping, today)

  // список удалили или его нет — после загрузки списков уходим на «Списки»
  if (projectId !== null && !projects.loading && !projects.error && !project) {
    return <Navigate to="/lists" replace />
  }

  const title = smartTitle ?? project?.name ?? ''
  const canAdd = spec.view === 'project' || spec.view === 'inbox' || spec.view === 'all' || spec.view === 'today'

  const addTask = async (t: string) => {
    const created = await add({
      title: t,
      project_id: projectId,
      scheduled_for: spec.view === 'today' ? today : undefined,
    })
    return created !== null
  }

  return (
    <div className="screen screen-with-add">
      <ScreenHeader
        back="/lists"
        title={
          <span className="title-with-dot">
            {project && <span className="dot dot-lg" style={{ background: project.color }} />}
            {title}
          </span>
        }
        right={
          project && (
            <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="меню списка">
              <MoreIcon />
            </button>
          )
        }
      />

      {progress && progress.total > 0 && (
        <div className="week-progress">
          <span className="progress-track">
            <span className="progress-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </span>
          <span className="mono-num muted">
            {progress.done} / {progress.total} за неделю
          </span>
        </div>
      )}

      <div className="chips" role="radiogroup" aria-label="группировка">
        {(
          [
            ['date', 'по датам'],
            ['priority', 'по приоритету'],
          ] as const
        ).map(([g, label]) => (
          <button
            key={g}
            className={`chip ${grouping === g ? 'active' : ''}`}
            role="radio"
            aria-checked={grouping === g}
            onClick={() => setGrouping(g)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <button className="error-bar" onClick={() => reload()}>
          {error} · повторить
        </button>
      )}
      {actionError && (
        <button className="error-bar" onClick={clearActionError}>
          {actionError}
        </button>
      )}

      {loading && tasks.length === 0 ? (
        <div className="rows-loading">
          <SpinIcon />
        </div>
      ) : tasks.length === 0 && !error ? (
        <div className="empty">{emptyText ?? 'в списке пусто — добавь первую задачу'}</div>
      ) : (
        sectionsFor(grouping).map(({ key, label }) => {
          const list = groups.get(key) ?? []
          if (list.length === 0) return null
          return (
            <section key={key} className="task-section">
              <div className={`section-label ${key === 'overdue' ? 'danger' : ''}`}>
                {label}
                <span className="mono-num">{list.length}</span>
              </div>
              {runsOf(list, grouping).map((run) => (
                <TaskRun
                  key={run[0].id}
                  run={run}
                  today={today}
                  draggable={draggable}
                  projectById={spec.view === 'project' ? undefined : projectById}
                  onToggle={(t) => update(t.id, { done: !t.done })}
                  onReorder={reorder}
                />
              ))}
            </section>
          )
        })
      )}

      {canAdd && (
        <QuickAdd
          placeholder={spec.view === 'today' ? 'задача на сегодня' : `новая задача${project ? ` в «${project.name}»` : ''}`}
          onAdd={addTask}
        />
      )}

      {menuOpen && project && (
        <ProjectMenu
          project={project}
          onClose={() => setMenuOpen(false)}
          onRename={(name) => projects.update(project.id, { name })}
          onColor={(color) => projects.update(project.id, { color })}
          onArchive={async () => {
            if (await projects.update(project.id, { archived: true })) navigate('/lists')
          }}
          onDelete={async () => {
            if (await projects.remove(project.id)) navigate('/lists')
          }}
        />
      )}
      {projects.actionError && (
        <button className="error-bar" onClick={projects.clearActionError}>
          {projects.actionError}
        </button>
      )}
    </div>
  )
}

/**
 * Секция режется на отрезки, внутри которых можно перетаскивать. По датам задачи
 * отсортированы по приоритету, поэтому отрезок — подряд идущие задачи одного приоритета:
 * иначе перетащенная «обычная» над «срочной» тут же отскочила бы обратно.
 */
function runsOf(list: Task[], grouping: Grouping): Task[][] {
  if (grouping === 'priority') return [list]
  const runs: Task[][] = []
  for (const t of list) {
    const last = runs[runs.length - 1]
    if (last && last[0].priority === t.priority) last.push(t)
    else runs.push([t])
  }
  return runs
}

interface RunProps {
  run: Task[]
  today: DateStr
  draggable: boolean
  projectById?: Map<number, Project>
  onToggle: (t: Task) => void
  onReorder: (ids: number[]) => void
}

function TaskRun({ run, today, draggable, projectById, onToggle, onReorder }: RunProps) {
  const [order, setOrder] = useState<number[] | null>(null) // порядок во время перетаскивания
  const orderRef = useRef<number[] | null>(null)
  const byId = new Map(run.map((t) => [t.id, t]))
  const ids = (order ?? run.map((t) => t.id)).filter((id) => byId.has(id))

  const rowOf = (t: Task) => ({
    task: t,
    today,
    project: t.project_id !== null ? projectById?.get(t.project_id) : undefined,
    onToggle: () => onToggle(t),
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

interface MenuProps {
  project: Project
  onClose: () => void
  onRename: (name: string) => void
  onColor: (color: string) => void
  onArchive: () => void
  onDelete: () => void
}

/** Меню списка: переименовать, цвет, архивировать, удалить (с подтверждением). */
function ProjectMenu({ project, onClose, onRename, onColor, onArchive, onDelete }: MenuProps) {
  const [name, setName] = useState(project.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const commitName = () => {
    const n = name.trim()
    if (!n) setName(project.name)
    else if (n !== project.name) onRename(n)
  }

  return (
    <Sheet label="меню списка" onClose={onClose}>
      <div className="card">
        <div className="field-label">название</div>
        <input
          className="text-input"
          value={name}
          maxLength={PROJECT_NAME_MAX}
          aria-label="название списка"
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />

        <div className="field-label">цвет</div>
        <ColorSwatches value={project.color} onPick={(c) => c !== project.color && onColor(c)} />

        <div className="card-actions">
          <button className="btn" onClick={onArchive}>
            в архив
          </button>
          {confirmDelete ? (
            <button className="btn btn-danger" onClick={onDelete}>
              <TrashIcon />
              удалить? задачи уйдут во входящие
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
              <TrashIcon />
              удалить
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
