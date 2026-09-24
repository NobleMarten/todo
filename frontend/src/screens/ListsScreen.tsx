import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Reorder, useDragControls } from 'framer-motion'
import type { Project } from '../api/types'
import { ColorSwatches } from '../components/ProjectPicker'
import { ProjectRow } from '../components/ProjectRow'
import { ScreenHeader } from '../components/ScreenHeader'
import { ChevronIcon, MoonIcon, PlusIcon, SpinIcon, SunIcon } from '../components/icons'
import { useProjects } from '../hooks/useProjects'
import { useSmartCounts } from '../hooks/useTasks'
import type { Theme } from '../hooks/useTheme'
import { longDateLabel, todayStr } from '../lib/date'
import { PROJECT_COLORS, PROJECT_NAME_MAX } from '../lib/format'

interface Props {
  theme: Theme
  onToggleTheme: () => void
}

export function ListsScreen({ theme, onToggleTheme }: Props) {
  const { projects, archived, loading, error, actionError, clearActionError, reload, create, update, reorder } =
    useProjects()
  const counts = useSmartCounts()
  const [order, setOrder] = useState<number[] | null>(null) // порядок во время перетаскивания
  const orderRef = useRef<number[] | null>(null)
  const drag = (next: number[]) => {
    orderRef.current = next
    setOrder(next)
  }
  const drop = () => {
    if (orderRef.current) reorder(orderRef.current)
    orderRef.current = null
    setOrder(null)
  }
  const [showArchived, setShowArchived] = useState(false)

  const byId = new Map(projects.map((p) => [p.id, p]))
  const ids = order ?? projects.map((p) => p.id)

  const smart = [
    { to: '/lists/today', label: 'сегодня', count: counts?.today, tone: 'accent' },
    { to: '/lists/week', label: '7 дней', count: counts?.week, tone: 'warn' },
    { to: '/lists/overdue', label: 'просрочено', count: counts?.overdue, tone: 'danger' },
    { to: '/lists/all', label: 'все задачи', count: counts?.all, tone: 'muted' },
  ].filter((s) => s.tone !== 'danger' || (s.count ?? 0) > 0)

  return (
    <div className="screen">
      <ScreenHeader
        subtitle={longDateLabel(todayStr())}
        right={
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'светлая тема' : 'тёмная тема'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        }
      />

      <div className="smart-grid">
        {smart.map((s) => (
          <Link key={s.to} to={s.to} className={`smart-card tone-${s.tone}`}>
            <span className="smart-count mono-num">{s.count ?? '·'}</span>
            <span className="smart-label">{s.label}</span>
          </Link>
        ))}
      </div>

      <div className="section-label">списки</div>

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

      <div className="rows">
        <ProjectRow to="/lists/inbox" name="входящие" color={null} active={counts?.inbox} />

        {loading && projects.length === 0 ? (
          <div className="rows-loading">
            <SpinIcon />
          </div>
        ) : (
          <Reorder.Group as="div" axis="y" values={ids} onReorder={drag} className="reorder">
            {ids.map((id) => {
              const p = byId.get(id)
              return p ? (
                <DraggableProject key={id} project={p} onDrop={drop} />
              ) : null
            })}
          </Reorder.Group>
        )}

        <NewProject onCreate={create} nextColor={PROJECT_COLORS[projects.length % PROJECT_COLORS.length]} />
      </div>

      {archived.length > 0 && (
        <div className="archived">
          <button
            className="section-label section-toggle"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
          >
            в архиве · {archived.length}
            <ChevronIcon open={showArchived} />
          </button>
          {showArchived && (
            <div className="rows">
              {archived.map((p) => (
                <ProjectRow
                  key={p.id}
                  to={`/lists/${p.id}`}
                  name={p.name}
                  color={p.color}
                  action={
                    <button className="chip" onClick={() => update(p.id, { archived: false })}>
                      вернуть
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DraggableProject({ project, onDrop }: { project: Project; onDrop: () => void }) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      as="div"
      value={project.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      className="reorder-item"
    >
      <ProjectRow
        to={`/lists/${project.id}`}
        name={project.name}
        color={project.color}
        active={project.counts?.active}
        overdue={project.counts?.overdue}
        dragControls={controls}
      />
    </Reorder.Item>
  )
}

/** Строка «новый список» с пунктирной рамкой; по нажатию раскрывается в форму. */
function NewProject({
  onCreate,
  nextColor,
}: {
  onCreate: (name: string, color: string) => Promise<Project | null>
  nextColor: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    const created = await onCreate(n, color ?? nextColor)
    setBusy(false)
    if (created) {
      setName('')
      setColor(null)
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <button className="new-project" onClick={() => setOpen(true)}>
        <PlusIcon />
        новый список
      </button>
    )
  }

  return (
    <form className="new-project open" onSubmit={submit}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="название списка"
        aria-label="название списка"
        maxLength={PROJECT_NAME_MAX}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <ColorSwatches value={color ?? nextColor} onPick={setColor} />
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          отмена
        </button>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy}>
          создать
        </button>
      </div>
    </form>
  )
}
