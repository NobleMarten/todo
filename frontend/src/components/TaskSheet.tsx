import { useCallback, useState } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'
import type { Priority, Task } from '../api/types'
import { useProjects } from '../hooks/useProjects'
import { useTask } from '../hooks/useTasks'
import { todayStr } from '../lib/date'
import { PRIORITIES, PRIORITY_LABEL, TITLE_MAX } from '../lib/format'
import { DatePicker } from './DatePicker'
import { ProjectPicker } from './ProjectPicker'
import { Sheet } from './Sheet'
import { SubtaskList } from './SubtaskRow'
import { BackIcon, CheckIcon, CloseIcon, SpinIcon, TrashIcon } from './icons'

type SheetState = { background?: Location }

/**
 * Открыть карточку задачи поверх текущего экрана. Экран под шитом запоминается
 * в location.state.background; из одной карточки в другую переходим с replace,
 * чтобы «назад» закрывал шит, а не листал карточки.
 */
export function useOpenTask() {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(
    (id: number) => {
      const bg = (location.state as SheetState | null)?.background
      navigate(`/task/${id}`, { state: { background: bg ?? location }, replace: Boolean(bg) })
    },
    [navigate, location],
  )
}

interface Props {
  id: number
  onClose: () => void
}

export function TaskSheet({ id, onClose }: Props) {
  const { task, loading, error, actionError, clearActionError, update, addSubtask, updateSubtask, remove } =
    useTask(id)

  return (
    <Sheet label="карточка задачи" onClose={onClose}>
      <div className="sheet-top">
        <button className="icon-btn" onClick={onClose} aria-label="закрыть">
          <CloseIcon />
        </button>
      </div>
      {loading && !task ? (
        <div className="sheet-loading">
          <SpinIcon />
        </div>
      ) : error || !task ? (
        <div className="inline-error">{error ?? 'задача не найдена'}</div>
      ) : (
        <TaskCard
          key={task.id}
          task={task}
          update={update}
          addSubtask={addSubtask}
          updateSubtask={updateSubtask}
          remove={async () => {
            if (await remove()) onClose()
          }}
        />
      )}
      {actionError && (
        <button className="inline-error" onClick={clearActionError}>
          {actionError}
        </button>
      )}
    </Sheet>
  )
}

type Actions = Pick<ReturnType<typeof useTask>, 'update' | 'addSubtask' | 'updateSubtask'> & {
  remove: () => void
}

function TaskCard({ task, update, addSubtask, updateSubtask, remove }: { task: Task } & Actions) {
  const openTask = useOpenTask()
  const { projects } = useProjects()
  const [pickingProject, setPickingProject] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const today = todayStr()
  const isSubtask = task.parent_id !== null
  const project = projects.find((p) => p.id === task.project_id)

  return (
    <div className="card">
      <TitleEditor title={task.title} done={task.done} onSave={(title) => update({ title })} />

      <div className="card-chips">
        {isSubtask ? (
          <button className="chip" onClick={() => openTask(task.parent_id!)}>
            <BackIcon />
            родительская задача
          </button>
        ) : (
          <button
            className={`chip ${pickingProject ? 'active' : ''}`}
            onClick={() => setPickingProject((v) => !v)}
            aria-expanded={pickingProject}
          >
            <span
              className={`dot ${project ? '' : 'dot-hollow'}`}
              style={project ? { background: project.color } : undefined}
            />
            {project?.name ?? 'входящие'}
          </button>
        )}

        <div className="segment" role="radiogroup" aria-label="приоритет">
          {PRIORITIES.map((p: Priority) => (
            <button
              key={p}
              className={`segment-btn prio-${p} ${task.priority === p ? 'active' : ''}`}
              role="radio"
              aria-checked={task.priority === p}
              onClick={() => task.priority !== p && update({ priority: p })}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {pickingProject && !isSubtask && (
        <ProjectPicker
          projects={projects}
          value={task.project_id}
          onPick={(pid) => {
            setPickingProject(false)
            if (pid !== task.project_id) update({ project_id: pid })
          }}
        />
      )}

      <DatePicker
        label="дедлайн — когда нельзя позже"
        value={task.due_date}
        today={today}
        danger={task.due_date !== null && task.due_date < today && !task.done}
        onChange={(v) => update({ due_date: v })}
      />
      <DatePicker
        label="делаю — когда сажусь за неё"
        value={task.scheduled_for}
        today={today}
        onChange={(v) => update({ scheduled_for: v })}
      />

      {!isSubtask && (
        <section className="card-section">
          <div className="field-label">подзадачи</div>
          <SubtaskList
            subtasks={task.subtasks ?? []}
            onToggle={(s) => updateSubtask(s.id, { done: !s.done })}
            onOpen={(s) => openTask(s.id)}
            onAdd={addSubtask}
          />
        </section>
      )}

      <section className="card-section">
        <div className="field-label">заметка</div>
        <NoteEditor note={task.note} onSave={(note) => update({ note })} />
      </section>

      <div className="card-actions">
        <button className={`btn ${task.done ? '' : 'btn-primary'}`} onClick={() => update({ done: !task.done })}>
          <CheckIcon />
          {task.done ? 'вернуть в работу' : 'выполнено'}
        </button>
        {confirmDelete ? (
          <button className="btn btn-danger" onClick={remove} onBlur={() => setConfirmDelete(false)} autoFocus>
            <TrashIcon />
            {task.subtasks?.length ? 'удалить с подзадачами?' : 'точно удалить?'}
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)} aria-label="удалить задачу">
            <TrashIcon />
            удалить
          </button>
        )}
      </div>
    </div>
  )
}

/** Заголовок правится по месту; пустой не сохраняем — возвращаем прежний. */
function TitleEditor({ title, done, onSave }: { title: string; done: boolean; onSave: (t: string) => void }) {
  const [draft, setDraft] = useState(title)
  const [prevTitle, setPrevTitle] = useState(title)
  if (title !== prevTitle) {
    // заголовок сменился снаружи (сохранение, перечитывание) — подтягиваем
    setPrevTitle(title)
    setDraft(title)
  }

  const commit = () => {
    const t = draft.trim()
    if (!t) setDraft(title)
    else if (t !== title) onSave(t)
  }

  return (
    <textarea
      className={`card-title ${done ? 'done' : ''}`}
      value={draft}
      rows={1}
      maxLength={TITLE_MAX}
      aria-label="заголовок"
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function NoteEditor({ note, onSave }: { note: string | null; onSave: (n: string | null) => void }) {
  const [draft, setDraft] = useState(note ?? '')
  const [prevNote, setPrevNote] = useState(note)
  if (note !== prevNote) {
    setPrevNote(note)
    setDraft(note ?? '')
  }

  return (
    <textarea
      className="card-note"
      value={draft}
      rows={3}
      placeholder="детали, ссылки, мысли"
      aria-label="заметка"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = draft.trim() ? draft : null
        if (n !== note) onSave(n)
      }}
    />
  )
}
