import { useState, type CSSProperties } from 'react'
import type { Priority, Task } from '../api/types'
import { useAutosize } from '../hooks/useAutosize'
import { useOpenTask } from '../hooks/useOpenTask'
import { useProjects } from '../hooks/useProjects'
import { statsOf, useTask } from '../hooks/useTasks'
import { todayStr } from '../lib/date'
import { PRIORITIES, PRIORITY_LABEL, TITLE_MAX } from '../lib/format'
import { DatePicker } from './DatePicker'
import { ProjectPicker } from './ProjectPicker'
import { RepeatField } from './RepeatField'
import { Sheet } from './Sheet'
import { SubtaskAdder, SubtaskList } from './SubtaskRow'
import { BackIcon, CheckIcon, CloseIcon, SpinIcon, TrashIcon } from './icons'

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
        <button className="box-btn" onClick={onClose} aria-label="закрыть карточку">
          <span className="box">
            <CloseIcon />
          </span>
        </button>
        <span className="sheet-caption">{task?.parent_id ? 'подзадача' : 'задача'} · #{id}</span>
        <span className="box-btn" aria-hidden="true" />
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

/** Карточка (макет C2): заголовок с чекбоксом, список и приоритет, две даты, подзадачи, заметка. */
function TaskCard({ task, update, addSubtask, updateSubtask, remove }: { task: Task } & Actions) {
  const openTask = useOpenTask()
  const { projects } = useProjects()
  const [pickingProject, setPickingProject] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const today = todayStr()
  const isSubtask = task.parent_id !== null
  const project = projects.find((p) => p.id === task.project_id)
  const subtasks = task.subtasks ?? []
  const stats = statsOf(subtasks)
  const tint = project ? ({ '--tint': project.color } as CSSProperties) : undefined

  return (
    <div className="card" style={tint}>
      <div className="card-head">
        <button
          className="check-hit"
          onClick={() => update({ done: !task.done })}
          aria-label={task.done ? 'вернуть задачу' : 'выполнить задачу'}
          aria-pressed={task.done}
        >
          <span className={`check check-lg prio-${task.priority} ${task.done ? 'checked' : ''}`}>
            {task.done && <CheckIcon />}
          </span>
        </button>
        <TitleEditor title={task.title} done={task.done} onSave={(title) => update({ title })} />
      </div>

      <div className="card-chips">
        {isSubtask ? (
          <button className="chip" onClick={() => openTask(task.parent_id!)}>
            <BackIcon />
            родительская задача
          </button>
        ) : (
          <button
            className={`chip project-chip ${project ? 'tinted' : ''}`}
            onClick={() => setPickingProject((v) => !v)}
            aria-expanded={pickingProject}
          >
            <span className={`dot ${project ? '' : 'dot-hollow'}`} />
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

      <div className="date-fields">
        <DatePicker
          kind="due"
          label="дедлайн — когда нельзя позже"
          value={task.due_date}
          today={today}
          onChange={(v) => update({ due_date: v })}
        />
        <DatePicker
          kind="scheduled"
          label="делаю — когда сажусь за неё"
          value={task.scheduled_for}
          today={today}
          onChange={(v) => update({ scheduled_for: v })}
        />
        {!isSubtask && !task.done && (
          <RepeatField
            value={task.repeat}
            base={task.scheduled_for ?? task.due_date ?? today}
            onChange={(v) => update({ repeat: v })}
          />
        )}
      </div>

      {!isSubtask && (
        <section className="card-section">
          <div className="card-section-head">
            <span className="field-label">подзадачи</span>
            {stats.total > 0 && (
              <span className="mono-num muted">
                {stats.done} / {stats.total}
              </span>
            )}
          </div>
          {stats.total > 0 && (
            <span className="progress-track thin">
              <span className="progress-fill" style={{ width: `${(stats.done / stats.total) * 100}%` }} />
            </span>
          )}
          <SubtaskList
            subtasks={subtasks}
            onToggle={(s) => updateSubtask(s.id, { done: !s.done })}
            onOpen={(s) => openTask(s.id)}
          />
          <SubtaskAdder label="добавить подзадачу" variant="link" onAdd={addSubtask} />
        </section>
      )}

      <section className="card-section">
        <span className="field-label">заметка</span>
        <NoteEditor note={task.note} onSave={(note) => update({ note })} />
      </section>

      <div className="card-actions">
        {confirmDelete ? (
          <>
            <button className="btn btn-big" onClick={() => setConfirmDelete(false)}>
              отмена
            </button>
            <button className="btn btn-big btn-danger" onClick={remove}>
              <TrashIcon />
              {subtasks.length ? 'удалить с подзадачами' : 'удалить'}
            </button>
          </>
        ) : (
          <>
            <button
              className={`btn btn-big ${task.done ? '' : 'btn-primary'}`}
              onClick={() => update({ done: !task.done })}
            >
              {task.done ? 'вернуть в работу' : 'выполнено'}
            </button>
            <button className="btn btn-big btn-square" onClick={() => setConfirmDelete(true)} aria-label="удалить задачу">
              <TrashIcon />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Заголовок правится по месту; пустой не сохраняем — возвращаем прежний. */
function TitleEditor({ title, done, onSave }: { title: string; done: boolean; onSave: (t: string) => void }) {
  const [draft, setDraft] = useState(title)
  const [prevTitle, setPrevTitle] = useState(title)
  const ref = useAutosize(draft)
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
      ref={ref}
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
  const ref = useAutosize(draft)
  if (note !== prevNote) {
    setPrevNote(note)
    setDraft(note ?? '')
  }

  return (
    <textarea
      ref={ref}
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
