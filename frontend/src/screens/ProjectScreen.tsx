import { useState, type CSSProperties } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import type { Project, Task } from '../api/types'
import { ColorSwatches } from '../components/ProjectPicker'
import { QuickAdd } from '../components/QuickAdd'
import { ScreenHeader } from '../components/ScreenHeader'
import { Sheet } from '../components/Sheet'
import { TaskRun } from '../components/TaskRun'
import { DoneSection } from '../components/DoneSection'
import { ErrorState } from '../components/ErrorState'
import { SkeletonRows } from '../components/Skeleton'
import { MoreIcon, TrashIcon } from '../components/icons'
import { useProjects } from '../hooks/useProjects'
import { matchesSpec, reorderScopeOf, useTasks, useWeekProgress, type ListSpec } from '../hooks/useTasks'
import { todayStr } from '../lib/date'
import type { QuickParse } from '../lib/quickAdd'
import { groupTasks, PROJECT_NAME_MAX, sectionsFor, type Grouping } from '../lib/format'

// подсказка синтаксиса быстрого ввода в пустом списке
const QUICK_ADD_HINT = 'в поле внизу: «#список», «!срочно» / «!важно», «завтра», «пт» или «25.09»'

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
  const { tasks, loading, error, actionError, clearActionError, reload, add, update, remove, reorder } = useTasks(spec)
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

  // #список из быстрого ввода важнее текущего списка; в «сегодня» задача ещё и планируется на сегодня
  const addTask = async (p: QuickParse) => {
    const target = p.project ?? project
    const created = await add({
      title: p.title,
      project_id: target ? target.id : projectId,
      priority: p.priority,
      due_date: p.dueDate,
      scheduled_for: spec.view === 'today' ? today : undefined,
    })
    if (!created) return null
    return matchesSpec(created, spec, today) ? {} : { hint: `добавлено в «${target?.name ?? 'входящие'}»` }
  }

  const tint = project ? ({ '--tint': project.color } as CSSProperties) : undefined

  return (
    <div className="screen" style={tint}>
      <ScreenHeader
        back="/lists"
        title={
          <span className="title-with-dot">
            {project && <span className="dot dot-title" />}
            {title}
          </span>
        }
        right={
          project && (
            <button className="box-btn" onClick={() => setMenuOpen(true)} aria-label="настройки списка">
              <span className="box">
                <MoreIcon />
              </span>
            </button>
          )
        }
      >
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
              className={`chip chip-mono ${grouping === g ? 'active' : ''}`}
              role="radio"
              aria-checked={grouping === g}
              onClick={() => setGrouping(g)}
            >
              {label}
            </button>
          ))}
        </div>
      </ScreenHeader>

      {actionError && (
        <button className="error-bar" onClick={clearActionError}>
          {actionError}
        </button>
      )}

      {loading && tasks.length === 0 ? (
        <SkeletonRows count={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => reload()} />
      ) : tasks.length === 0 ? (
        <div className="empty">
          <span className="empty-title">{emptyText ?? 'в списке пусто'}</span>
          {canAdd && <span className="empty-hint">{QUICK_ADD_HINT}</span>}
        </div>
      ) : (
        sectionsFor(grouping).map(({ key, label }) => {
          const list = groups.get(key) ?? []
          if (list.length === 0) return null
          return (
            <section key={key} className="task-section">
              <div className={`section-label tone-${key}`}>
                {label} · {list.length}
              </div>
              {runsOf(list, grouping).map((run) => (
                <TaskRun
                  key={run[0].id}
                  run={run}
                  today={today}
                  draggable={draggable}
                  projectById={spec.view === 'project' ? undefined : projectById}
                  onToggle={(t) => update(t.id, { done: !t.done })}
                  onSetDue={(t, d) => update(t.id, { due_date: d })}
                  onReorder={reorder}
                  onDelete={(t) => remove(t.id)}
                  onToday={(t) => update(t.id, { scheduled_for: today })}
                />
              ))}
            </section>
          )
        })
      )}

      {/* выполненные — только у «папок»: списка и входящих */}
      {!error && spec.view === 'project' && <DoneSection scope={{ view: 'project', projectId: spec.projectId }} />}
      {!error && spec.view === 'inbox' && <DoneSection scope={{ view: 'inbox' }} />}

      {canAdd && (
        <QuickAdd
          placeholder={
            spec.view === 'today' ? 'задача на сегодня…' : project ? `задача в ${project.name}…` : 'задача во входящие…'
          }
          label={project ? `новая задача в списке ${project.name}` : 'новая задача'}
          projects={projects.projects}
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
